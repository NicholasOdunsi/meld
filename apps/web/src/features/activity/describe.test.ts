import { describe, expect, it } from "vitest";
import type { RoomActivity } from "@meld/contracts";
import { describeHatLabel, describeNeedsYou, describeProjectStatus } from "./describe";

function needs(overrides: Partial<RoomActivity>): RoomActivity {
  return {
    roomId: "r", projectId: "p", roomName: "Onboarding", state: "needs_you", reason: "finished",
    taskKind: "room_reply", taskStatus: "completed", provider: "claude",
    proposalKind: null, proposalMessageId: null, occurredAt: null, lastActivityAt: null,
    ...overrides,
  };
}

describe("describeNeedsYou", () => {
  it.each([
    [{ reason: "asked", proposalKind: "prd_generate" }, "Write the PRD?", "Answer"],
    [{ reason: "asked", proposalKind: "prd_revise" }, "Update the PRD?", "Answer"],
    [{ reason: "asked", proposalKind: "user_flow_generate" }, "Map the user flow?", "Answer"],
    [{ reason: "asked", proposalKind: "decision_capture" }, "Capture a decision?", "Answer"],
    [{ reason: "finished", taskKind: "design_screen_generate" }, "New screens are ready", "Review"],
    [{ reason: "finished", taskKind: "user_flow_generate" }, "User flow is ready", "Review"],
    [{ reason: "finished", taskKind: "prd_generate" }, "PRD is ready", "Review"],
    [{ reason: "finished", taskKind: "prd_revise" }, "PRD is ready", "Review"],
    [{ reason: "finished", taskKind: "room_reply" }, "Orion replied", "Review"],
    [{ reason: "stuck", taskStatus: "needs_reauthentication", provider: "claude" }, "Sign in to Claude again", "Fix"],
    [{ reason: "stuck", taskStatus: "usage_limit_reached", provider: "codex" }, "Codex usage limit reached", "Fix"],
    [{ reason: "stuck", taskStatus: "needs_review" }, "A result needs a look", "Review"],
    [{ reason: "stuck", taskStatus: "failed" }, "Something went wrong", "Fix"],
  ] as const)("%o → %s / %s", (overrides, title, action) => {
    expect(describeNeedsYou(needs(overrides as Partial<RoomActivity>))).toEqual({ title, action });
  });
});

describe("describeHatLabel", () => {
  it("names working", () => expect(describeHatLabel("Orion", null, "working")).toBe("Orion: working"));
  it("names the reason", () =>
    expect(describeHatLabel("Mark", needs({ reason: "asked", proposalKind: "prd_generate" }), "needs_you"))
      .toBe("Mark needs you · Write the PRD?"));
});

describe("describeProjectStatus", () => {
  const rel = () => "Tuesday";
  it("working names the tab", () =>
    expect(describeProjectStatus({ projectId: "p", state: "working", room: needs({ state: "working", roomName: "Inbox screen" }) }, null, rel))
      .toBe("Working on Inbox screen…"));
  it("needs-you uses the title", () =>
    expect(describeProjectStatus({ projectId: "p", state: "needs_you", room: needs({}) }, null, rel)).toBe("Orion replied"));
  it("idle uses last activity", () =>
    expect(describeProjectStatus({ projectId: "p", state: "idle", room: null }, "2026-11-03T10:00:00Z", rel)).toBe("Last active Tuesday"));
  it("never active", () =>
    expect(describeProjectStatus({ projectId: "p", state: "idle", room: null }, null, rel)).toBe("No activity yet"));
});
