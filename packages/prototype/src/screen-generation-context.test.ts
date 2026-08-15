import { describe, expect, it } from "vitest";
import {
  computeDanglingTargets,
  formatScreenGenerationContext,
} from "./screen-generation-context";

describe("computeDanglingTargets", () => {
  it("lists target keys with no owning screen as dangling", () => {
    const screens = [
      {
        screenKey: "home",
        actions: [{ id: "p", label: "Projects", targetScreenKey: "projects" }],
      },
    ];
    expect(computeDanglingTargets(screens)).toEqual(["projects"]);
  });

  it("does not list a target key that a screen in the set owns", () => {
    const screens = [
      {
        screenKey: "home",
        actions: [{ id: "p", label: "Projects", targetScreenKey: "projects" }],
      },
      { screenKey: "projects", actions: [] },
    ];
    expect(computeDanglingTargets(screens)).toEqual([]);
  });

  it("de-duplicates a target referenced by multiple actions", () => {
    const screens = [
      {
        screenKey: "home",
        actions: [
          { id: "p1", label: "Projects", targetScreenKey: "projects" },
          { id: "p2", label: "Projects again", targetScreenKey: "projects" },
        ],
      },
    ];
    expect(computeDanglingTargets(screens)).toEqual(["projects"]);
  });

  it("ignores actions with no target and screens with no actions", () => {
    const screens = [
      { screenKey: "home", actions: [{ id: "noop", label: "Toggle" }] },
      { screenKey: "empty" },
    ];
    expect(computeDanglingTargets(screens)).toEqual([]);
  });
});

describe("formatScreenGenerationContext", () => {
  it("formats existing screens + dangling into prompt data", () => {
    const text = formatScreenGenerationContext({
      existingScreens: [{ key: "home", name: "Home" }],
      danglingTargets: ["projects"],
    });
    expect(text).toContain("home");
    expect(text).toContain("projects");
  });

  it("returns an empty string when there is nothing to report", () => {
    expect(
      formatScreenGenerationContext({ existingScreens: [], danglingTargets: [] }),
    ).toBe("");
  });

  it("omits the dangling-targets section when there are none", () => {
    const text = formatScreenGenerationContext({
      existingScreens: [{ key: "home", name: "Home" }],
      danglingTargets: [],
    });
    expect(text).toContain("home");
    expect(text).not.toContain("Buttons already point");
  });
});
