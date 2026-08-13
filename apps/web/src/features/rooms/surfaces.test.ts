import { describe, expect, it } from "vitest";
import { getRoomSurfaces, resolveRoomSurface } from "./surfaces";

describe("getRoomSurfaces", () => {
  it.each([
    [
      {
        hasUserFlow: false,
        hasPrd: false,
        hasPrdTask: false,
        hasBuiltDesignScreen: false,
        decisionCount: 0,
      },
      ["conversation"],
    ],
    [
      {
        hasUserFlow: true,
        hasPrd: false,
        hasPrdTask: false,
        hasBuiltDesignScreen: false,
        decisionCount: 0,
      },
      ["conversation", "user-flows"],
    ],
    [
      {
        hasUserFlow: false,
        hasPrd: true,
        hasPrdTask: false,
        hasBuiltDesignScreen: false,
        decisionCount: 0,
      },
      ["conversation", "prd"],
    ],
    [
      {
        hasUserFlow: false,
        hasPrd: false,
        hasPrdTask: true,
        hasBuiltDesignScreen: false,
        decisionCount: 0,
      },
      ["conversation", "prd"],
    ],
    [
      {
        hasUserFlow: false,
        hasPrd: false,
        hasPrdTask: false,
        hasBuiltDesignScreen: false,
        decisionCount: 1,
      },
      ["conversation", "decisions"],
    ],
    [
      {
        hasUserFlow: true,
        hasPrd: true,
        hasPrdTask: false,
        hasBuiltDesignScreen: false,
        decisionCount: 0,
      },
      ["conversation", "user-flows", "prd", "overview"],
    ],
    [
      {
        hasUserFlow: true,
        hasPrd: false,
        hasPrdTask: false,
        hasBuiltDesignScreen: false,
        decisionCount: 1,
      },
      ["conversation", "user-flows", "decisions", "overview"],
    ],
    // A PRD that exists *and* has a live generation task is one artifact, not
    // two. The `||` keeps it that way; refactoring it into two `if`s would push
    // "prd" twice, take artifacts.length to 2, and put Overview on a Room with
    // a single artifact.
    [
      {
        hasUserFlow: false,
        hasPrd: true,
        hasPrdTask: true,
        hasBuiltDesignScreen: false,
        decisionCount: 0,
      },
      ["conversation", "prd"],
    ],
  ] as const)("resolves artifact-backed surfaces", (input, expected) => {
    expect(getRoomSurfaces(input)).toEqual(expected);
  });

  it("includes Prototype only when a built design screen exists", () => {
    const state = {
      hasUserFlow: false,
      hasPrd: false,
      hasPrdTask: false,
      hasBuiltDesignScreen: false,
      decisionCount: 0,
    };

    expect(getRoomSurfaces(state)).not.toContain("prototype");
    expect(
      getRoomSurfaces({ ...state, hasBuiltDesignScreen: true }),
    ).toEqual(["conversation", "prototype"]);
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
