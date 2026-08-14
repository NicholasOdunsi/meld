import { describe, expect, it } from "vitest";
import { mergeDesignHistory, filterDesignHistory } from "./design-history";
import type { RoomMessage } from "@/features/rooms/repository";
import type { DesignScreenEvent } from "@meld/contracts";

function msg(id: string, createdAt: string): RoomMessage {
  return { id, createdAt } as unknown as RoomMessage;
}
function evt(id: string, createdAt: string, screenId: string | null): DesignScreenEvent {
  return {
    id, roomId: "r", screenId, kind: "version_created",
    messageId: null, taskId: null, versionId: null, actor: null, createdAt,
  } as unknown as DesignScreenEvent;
}

describe("mergeDesignHistory", () => {
  it("interleaves messages and events by createdAt", () => {
    const out = mergeDesignHistory(
      [msg("m1", "2026-08-14T10:00:00.000Z"), msg("m2", "2026-08-14T10:02:00.000Z")],
      [evt("e1", "2026-08-14T10:01:00.000Z", "s1")],
    );
    expect(out.map((e) => e.id)).toEqual(["m1", "e1", "m2"]);
    expect(out[0].type).toBe("message");
    expect(out[1].type).toBe("event");
  });
  it("breaks createdAt ties by id deterministically", () => {
    const out = mergeDesignHistory([msg("b", "2026-08-14T10:00:00.000Z")], [evt("a", "2026-08-14T10:00:00.000Z", null)]);
    expect(out.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("filterDesignHistory", () => {
  const merged = mergeDesignHistory(
    [msg("m1", "2026-08-14T10:00:00.000Z")],
    [evt("e1", "2026-08-14T10:01:00.000Z", "s1"), evt("e2", "2026-08-14T10:02:00.000Z", "s2")],
  );
  it("returns everything when nothing is selected", () => {
    expect(filterDesignHistory(merged, null).map((e) => e.id)).toEqual(["m1", "e1", "e2"]);
  });
  it("keeps only the selected screen's events when a screen is selected", () => {
    expect(filterDesignHistory(merged, "s1").map((e) => e.id)).toEqual(["e1"]);
  });
});
