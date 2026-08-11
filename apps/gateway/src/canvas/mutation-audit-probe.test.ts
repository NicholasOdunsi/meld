import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MutationAuditProbe,
  type CanvasSessionMeta,
} from "./mutation-audit-probe";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const EDITOR_A: CanvasSessionMeta & { sessionId: string } = {
  organizationId: ORGANIZATION_ID,
  roomId: ROOM_ID,
  userId: "10000000-0000-4000-8000-000000000001",
  userName: "Editor A",
  access: "edit",
  clientVersion: "5.3.0",
  sessionId: "session-a",
};
const EDITOR_B = {
  ...EDITOR_A,
  userId: "10000000-0000-4000-8000-000000000002",
  sessionId: "session-b",
};

const probes: MutationAuditProbe[] = [];
function createProbe() {
  const probe = new MutationAuditProbe();
  probes.push(probe);
  return probe;
}

afterEach(() => {
  for (const probe of probes.splice(0)) probe.dispose();
  vi.useRealTimers();
});

describe("MutationAuditProbe", () => {
  it("correlates several authorizer writes to one sorted committed diff", () => {
    const probe = createProbe();
    probe.beginMessage(EDITOR_A);
    probe.recordWrite(EDITOR_A, "shape:a");
    probe.recordWrite(EDITOR_A, "binding:a");
    probe.commit({
      documentClock: 7,
      touchedRecordIds: ["binding:a", "shape:a", "shape:a"],
    });

    expect(probe.events()).toEqual([
      {
        organizationId: ORGANIZATION_ID,
        roomId: ROOM_ID,
        actorId: EDITOR_A.userId,
        sessionId: EDITOR_A.sessionId,
        clientVersion: "5.3.0",
        documentClock: 7,
        origin: "client",
        touchedRecordIds: ["binding:a", "shape:a"],
      },
    ]);
    expect(probe.failures()).toEqual([]);
  });

  it("correlates concurrent queued messages in FIFO protocol order", () => {
    const probe = createProbe();
    probe.beginMessage(EDITOR_A);
    probe.beginMessage(EDITOR_B);
    probe.recordWrite(EDITOR_A, "shape:a");
    probe.recordWrite(EDITOR_B, "binding:b");

    probe.commit({ documentClock: 7, touchedRecordIds: ["shape:a"] });
    probe.commit({ documentClock: 8, touchedRecordIds: ["binding:b"] });

    expect(probe.events()).toEqual([
      expect.objectContaining({
        actorId: EDITOR_A.userId,
        sessionId: EDITOR_A.sessionId,
        documentClock: 7,
      }),
      expect.objectContaining({
        actorId: EDITOR_B.userId,
        sessionId: EDITOR_B.sessionId,
        documentClock: 8,
      }),
    ]);
    expect(probe.failures()).toEqual([]);
  });

  it("fails closed when a same-session write overlaps a new message", () => {
    const probe = createProbe();
    probe.beginMessage(EDITOR_A);
    probe.recordWrite(EDITOR_A, "shape:first");
    probe.beginMessage(EDITOR_A);

    expect(probe.failures()).toContainEqual(
      expect.objectContaining({
        code: "ambiguous_actor_overlap",
        sessionId: EDITOR_A.sessionId,
      }),
    );
    probe.commit({ documentClock: 10, touchedRecordIds: ["shape:first"] });
    expect(probe.events()).toEqual([]);
  });

  it("removes same-session presence placeholders before attaching a write", () => {
    const probe = createProbe();
    probe.beginMessage(EDITOR_A);
    probe.beginMessage(EDITOR_A);
    probe.recordWrite(EDITOR_A, "shape:a");
    probe.commit({ documentClock: 11, touchedRecordIds: ["shape:a"] });

    expect(probe.events()).toHaveLength(1);
    expect(probe.events()[0]).toMatchObject({
      sessionId: EDITOR_A.sessionId,
      documentClock: 11,
      touchedRecordIds: ["shape:a"],
    });
    expect(probe.failures()).toEqual([]);
  });

  it("drops presence-only entries before consuming a later write", () => {
    const probe = createProbe();
    probe.beginMessage(EDITOR_A);
    probe.beginMessage(EDITOR_B);
    probe.recordWrite(EDITOR_B, "shape:b");
    probe.commit({ documentClock: 9, touchedRecordIds: ["shape:b"] });

    expect(probe.events()).toHaveLength(1);
    expect(probe.events()[0]).toMatchObject({ sessionId: EDITOR_B.sessionId });
    expect(probe.failures()).toEqual([]);
  });

  it("reports a commit with no document message as missing attribution", () => {
    const probe = createProbe();
    probe.commit({ documentClock: 12, touchedRecordIds: [] });

    expect(probe.events()).toEqual([]);
    expect(probe.failures()).toContainEqual(
      expect.objectContaining({
        code: "missing_active_message",
        documentClock: 12,
      }),
    );
  });

  it("fails closed on a write from an unrecognized authenticated session", () => {
    const probe = createProbe();
    probe.beginMessage(EDITOR_A);
    probe.recordWrite(
      { ...EDITOR_A, userId: "10000000-0000-4000-8000-000000000099" },
      "shape:a",
    );
    probe.commit({ documentClock: 3, touchedRecordIds: ["shape:a"] });

    expect(probe.events()).toEqual([]);
    expect(probe.failures()).toContainEqual(
      expect.objectContaining({ code: "mixed_authenticated_sessions" }),
    );
  });

  it("expires a write-bearing no-op after the event-loop turn", () => {
    vi.useFakeTimers();
    const probe = createProbe();
    probe.beginMessage(EDITOR_A);
    probe.recordWrite(EDITOR_A, "shape:stale");
    vi.runAllTimers();

    expect(probe.failures()).toContainEqual(
      expect.objectContaining({
        code: "uncommitted_message_expired",
        expectedRecordIds: ["shape:stale"],
      }),
    );
    probe.commit({ documentClock: 4, touchedRecordIds: ["shape:stale"] });
    expect(probe.events()).toEqual([]);
  });

  it("fails closed when the diff does not match authorizer writes", () => {
    const probe = createProbe();
    probe.beginMessage(EDITOR_A);
    probe.recordWrite(EDITOR_A, "shape:a");
    probe.commit({ documentClock: 3, touchedRecordIds: ["shape:b"] });

    expect(probe.events()).toEqual([]);
    expect(probe.failures()).toContainEqual(
      expect.objectContaining({
        code: "diff_record_mismatch",
        expectedRecordIds: ["shape:a"],
        actualRecordIds: ["shape:b"],
      }),
    );
  });

  it("returns defensive copies and records server-origin evidence", () => {
    const probe = createProbe();
    probe.recordServerCommit({
      organizationId: ORGANIZATION_ID,
      roomId: ROOM_ID,
      documentClock: 1,
      touchedRecordIds: ["shape:b", "shape:a"],
    });
    const events = probe.events();
    events[0]!.touchedRecordIds.push("shape:c");
    expect(probe.events()[0]!.touchedRecordIds).toEqual(["shape:a", "shape:b"]);
    expect(probe.events()[0]).toMatchObject({ origin: "server", actorId: "gateway" });
  });
});
