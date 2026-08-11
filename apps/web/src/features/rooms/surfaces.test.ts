import { describe, expect, it } from "vitest";
import { getRoomSurfaces, resolveRoomSurface } from "./surfaces";

describe("getRoomSurfaces", () => {
  it.each([
    [
      {
        hasUserFlow: false,
        hasPrd: false,
        hasPrdTask: false,
        decisionCount: 0,
      },
      ["conversation"],
    ],
    [
      {
        hasUserFlow: true,
        hasPrd: false,
        hasPrdTask: false,
        decisionCount: 0,
      },
      ["conversation", "user-flows"],
    ],
    [
      {
        hasUserFlow: false,
        hasPrd: true,
        hasPrdTask: false,
        decisionCount: 0,
      },
      ["conversation", "prd"],
    ],
    [
      {
        hasUserFlow: false,
        hasPrd: false,
        hasPrdTask: true,
        decisionCount: 0,
      },
      ["conversation", "prd"],
    ],
    [
      {
        hasUserFlow: false,
        hasPrd: false,
        hasPrdTask: false,
        decisionCount: 1,
      },
      ["conversation", "decisions"],
    ],
    [
      {
        hasUserFlow: true,
        hasPrd: true,
        hasPrdTask: false,
        decisionCount: 0,
      },
      ["conversation", "user-flows", "prd", "overview"],
    ],
    [
      {
        hasUserFlow: true,
        hasPrd: false,
        hasPrdTask: false,
        decisionCount: 1,
      },
      ["conversation", "user-flows", "decisions", "overview"],
    ],
  ] as const)("resolves artifact-backed surfaces", (input, expected) => {
    expect(getRoomSurfaces(input)).toEqual(expected);
  });
});

describe("resolveRoomSurface", () => {
  const surfaces = ["conversation", "prd"] as const;

  it("keeps an available requested surface without rewriting the URL", () => {
    expect(resolveRoomSurface("prd", surfaces)).toEqual({
      activeSurface: "prd",
      shouldReplaceUrl: false,
    });
  });

  it("defaults an absent selection without rewriting the stable Room URL", () => {
    expect(resolveRoomSurface(undefined, surfaces)).toEqual({
      activeSurface: "conversation",
      shouldReplaceUrl: false,
    });
  });

  it.each(["decisions", "tasks", "unknown", ["prd"]])(
    "falls back unavailable or invalid input %j to Conversation",
    (requested) => {
      expect(resolveRoomSurface(requested, surfaces)).toEqual({
        activeSurface: "conversation",
        shouldReplaceUrl: true,
      });
    },
  );
});
