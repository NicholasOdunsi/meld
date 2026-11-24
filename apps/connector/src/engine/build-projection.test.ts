import { readFileSync } from "node:fs";
import { BuildEventSchema } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { approvalId, BuildProjection } from "./build-projection";

const threadId = "2c7d97dc-0ea9-49d9-b925-cc437d19a6b2";
const run = (ordinal: number) => `run:thread:${threadId}:ordinal:${ordinal}`;

function streamFixture(name: string): unknown[] {
  return readFileSync(new URL(`./fixtures/${name}.jsonl`, import.meta.url), "utf8").trim().split("\n")
    .flatMap((line) => JSON.parse(line).frame.values ?? []);
}

describe("build projection", () => {
  it("reads the recorded run through completion and retains its final assistant reply", () => {
    const projection = new BuildProjection(run(1));
    const events = streamFixture("build-turn").flatMap((packet) => projection.read(packet));
    expect(projection.terminal).toEqual({ status: "done", ordinal: 1 });
    expect(projection.reply).toContain("hello from Orion");
    expect(projection.changedFiles).toEqual([{ path: "README.md", added: 2, removed: 0 }]);
    expect(projection.sequence).toBeGreaterThan(0);
    expect(events.every((event) => BuildEventSchema.safeParse(event).success)).toBe(true);
  });

  it("projects only the selected run's approval, using a stable bounded ID", () => {
    const projection = new BuildProjection(run(4));
    const packets = streamFixture("approval");
    const original = packets.find((packet) => {
      const event = (packet as { event?: { payload?: { type?: string; runId?: string } } }).event;
      return event?.payload?.type === "approval_request" && event.payload.runId === run(4);
    }) as { event: { payload: { requestId: string } } };
    const events = packets.flatMap((packet) => projection.read(packet));
    const approvals = events.filter((event) => event.type === "approval_request");
    expect(approvals).toHaveLength(1);
    expect(approvals[0]?.request.id).toBe(approvalId(original.event.payload.requestId));
    expect(approvals[0]?.request.summary).toBe("npm install left-pad@1.2.0");
    expect(approvals[0]?.request.choices).toEqual([{ id: "accept", label: "Approve" }, { id: "decline", label: "Decline" }]);
    expect(events).toContainEqual({ type: "status", status: "needs_you" });
    expect(events).toContainEqual({ type: "status", status: "working" });
    expect(events.every((event) => BuildEventSchema.safeParse(event).success)).toBe(true);
    expect(projection.read(original)).toEqual([]);
  });

  it("throttles steps and leaves unrelated run updates out", () => {
    let now = 0;
    const projection = new BuildProjection(run(1), () => now);
    const packet = (sequence: number, runId: string) => ({
      kind: "event", sequence,
      event: { type: "turn-item.updated", payload: { runId, type: "command_execution", status: "running" } },
    });
    expect(projection.read(packet(1, run(2)))).toEqual([]);
    expect(projection.read(packet(2, run(1)))).toEqual([{ type: "step", label: "Running a command" }]);
    expect(projection.read(packet(3, run(1)))).toEqual([]);
    now += 2_000;
    expect(projection.read(packet(4, run(1)))).toHaveLength(1);
  });

  it("removes local paths including URL-encoded links from the cloud reply", () => {
    const worktrees = "/Users/ada/Library/Application Support/Meld/engine";
    const projection = new BuildProjection(run(1), Date.now, [worktrees]);
    projection.read({
      kind: "event", sequence: 1,
      event: { type: "message.updated", payload: {
        id: "reply", runId: run(1), role: "assistant", streaming: false,
        text: `See [file](${encodeURI(worktrees)}/example.ts) or /Users/ada/other/example.ts`,
      } },
    });
    expect(projection.reply).not.toContain("/Users/ada/");
    expect(projection.reply).toContain("example.ts");
  });
});
