import { describe, expect, it } from "vitest";
import { AITaskKindSchema } from "./ai";
import {
  BuildEventSchema,
  BuildStatusSchema,
  CodeLinkKindSchema,
  MAX_BUILD_CHANGED_FILES,
  RouteIntentSchema,
} from "./build";

describe("Build contracts", () => {
  it("knows the build task kinds", () => {
    for (const kind of ["code_link", "build_turn", "build_approval"]) {
      expect(AITaskKindSchema.parse(kind)).toBe(kind);
    }
  });

  it("knows statuses, link kinds and intents", () => {
    expect(BuildStatusSchema.options).toEqual(["working", "needs_you", "done", "failed", "cancelled"]);
    expect(CodeLinkKindSchema.options).toEqual(["github", "folder", "new_github"]);
    expect(RouteIntentSchema.options).toEqual(["answer", "build", "unsure"]);
  });

  it("accepts every build event shape", () => {
    for (const event of [
      { type: "status", status: "needs_you" },
      { type: "step", label: "Editing README.md" },
      { type: "reply", text: "Added the line." },
      { type: "changed_files", files: [{ path: "README.md", added: 1, removed: 0 }] },
      { type: "branch", name: "orion/readme-line" },
      {
        type: "approval_request",
        request: { id: "req-1", summary: "Install left-pad", choices: [{ id: "accept", label: "Approve" }, { id: "decline", label: "Decline" }] },
      },
      { type: "engine_offline" },
    ]) expect(BuildEventSchema.parse(event)).toEqual(event);
  });

  it("rejects oversized or unknown events", () => {
    const tooMany = Array.from({ length: MAX_BUILD_CHANGED_FILES + 1 }, (_, i) => ({ path: `f${i}`, added: 0, removed: 0 }));
    for (const event of [
      { type: "changed_files", files: tooMany },
      { type: "step", label: "" },
      { type: "status", status: "paused" },
      { type: "approval_request", request: { id: "x", summary: "s", choices: [] } },
      { type: "mystery" },
      { type: "branch", name: "b", extra: true },
    ]) expect(BuildEventSchema.safeParse(event).success).toBe(false);
  });
});
