import { describe, expect, it } from "vitest";
import { getRoomStagePresentation, parseRoomLifecycleRow } from "./stage";

describe("room stage presentation", () => {
  it.each([
    ["discovery", "Discovery"],
    ["define", "Define"],
    ["design", "Design"],
    ["development", "Development"],
  ] as const)("maps %s to %s", (stage, label) => {
    expect(getRoomStagePresentation(stage).label).toBe(label);
  });

  it("rejects partial Realtime room rows", () => {
    expect(() => parseRoomLifecycleRow({ id: crypto.randomUUID(), stage: "design" })).toThrow();
  });
});
