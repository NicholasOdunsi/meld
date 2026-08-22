import { describe, expect, it } from "vitest";
import {
  computeDanglingTargets,
  deriveScreenGenerationContext,
  formatScreenGenerationContext,
} from "./screen-generation-context";

describe("deriveScreenGenerationContext", () => {
  it("collects keyed screens, distinct layouts and dangling targets from a room's screens", () => {
    const context = deriveScreenGenerationContext([
      {
        name: "Dashboard",
        screenKey: "dashboard",
        layoutKey: "app_shell",
        layoutName: "App Shell",
        layout: { id: "l1", actions: [{ targetScreenKey: "settings" }] },
        preview: { actions: [{ targetScreenKey: "worklist" }] },
      },
      {
        name: "My Worklist",
        screenKey: "worklist",
        // Same layout, reached through a second screen -- listed once.
        layoutKey: "app_shell",
        layoutName: "App Shell",
        layout: { id: "l1", actions: [{ targetScreenKey: "settings" }] },
        preview: { actions: [] },
      },
    ]);

    expect(context.existingScreens).toEqual([
      { key: "dashboard", name: "Dashboard" },
      { key: "worklist", name: "My Worklist" },
    ]);
    expect(context.existingLayouts).toEqual([
      { key: "app_shell", name: "App Shell" },
    ]);
    // "worklist" is owned by a screen; "settings" -- reached only from the
    // layout's own nav -- is not, so it is the one dangling target.
    expect(context.danglingTargets).toEqual(["settings"]);
  });

  it("takes its component vocabulary from the first built screen that has one", () => {
    const context = deriveScreenGenerationContext([
      {
        name: "Empty Frame",
        screenKey: null,
        layoutKey: null,
        layoutName: null,
        layout: null,
        preview: null,
      },
      {
        name: "Ownership Transfer Dashboard",
        screenKey: "dashboard",
        layoutKey: "app_shell",
        layoutName: "App Shell",
        layout: { id: "l1", actions: [] },
        preview: {
          actions: [],
          styles: ".metric-card { background: #fff; border-radius: 8px; }",
        },
      },
    ]);

    expect(context.componentSource).toBe("Ownership Transfer Dashboard");
    expect(context.existingComponents).toEqual([
      {
        className: "metric-card",
        declarations: ["background: #fff", "border-radius: 8px"],
      },
    ]);
  });

  it("skips screens with no key and layouts with no key or name", () => {
    const context = deriveScreenGenerationContext([
      {
        name: "Unkeyed",
        screenKey: "",
        layoutKey: null,
        layoutName: null,
        layout: null,
        preview: null,
      },
    ]);

    expect(context.existingScreens).toEqual([]);
    expect(context.existingLayouts).toEqual([]);
    expect(context.danglingTargets).toEqual([]);
  });
});

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

  it("treats a layout nav target with no owning screen as dangling", () => {
    const out = computeDanglingTargets(
      [{ screenKey: "home", actions: [] }],
      [{ actions: [{ targetScreenKey: "vehicle_pool" }, { targetScreenKey: "home" }] }],
    );
    expect(out).toContain("vehicle_pool"); // unbuilt layout destination surfaced
    expect(out).not.toContain("home"); // owned by a screen → not dangling
  });

  it("still works with no layouts arg (back-compat)", () => {
    expect(
      computeDanglingTargets([{ screenKey: "a", actions: [{ targetScreenKey: "b" }] }]),
    ).toEqual(["b"]);
  });
});

describe("formatScreenGenerationContext", () => {
  it("formats existing screens + dangling into prompt data", () => {
    const text = formatScreenGenerationContext({
      existingScreens: [{ key: "home", name: "Home" }],
      danglingTargets: ["projects"],
      existingLayouts: [],
    });
    expect(text).toContain("home");
    expect(text).toContain("projects");
  });

  it("returns an empty string when there is nothing to report", () => {
    expect(
      formatScreenGenerationContext({
        existingScreens: [],
        danglingTargets: [],
        existingLayouts: [],
      }),
    ).toBe("");
  });

  it("omits the dangling-targets section when there are none", () => {
    const text = formatScreenGenerationContext({
      existingScreens: [{ key: "home", name: "Home" }],
      danglingTargets: [],
      existingLayouts: [],
    });
    expect(text).toContain("home");
    expect(text).not.toContain("Buttons already point");
  });

  it("lists existing layouts by key for reuse", () => {
    const out = formatScreenGenerationContext({
      existingScreens: [],
      danglingTargets: [],
      existingLayouts: [{ key: "app-shell", name: "App Shell" }],
    });
    expect(out).toContain("EXISTING LAYOUTS");
    expect(out).toContain("app-shell: App Shell");
  });

  it("omits the layouts block when there are none", () => {
    const out = formatScreenGenerationContext({
      existingScreens: [{ key: "home", name: "Home" }],
      danglingTargets: [],
      existingLayouts: [],
    });
    expect(out).not.toContain("EXISTING LAYOUTS");
  });

  it("returns empty when everything is empty", () => {
    expect(
      formatScreenGenerationContext({
        existingScreens: [],
        danglingTargets: [],
        existingLayouts: [],
      }),
    ).toBe("");
  });

  it("describes the room's established components, and lets a variation request override them", () => {
    const out = formatScreenGenerationContext({
      existingScreens: [],
      danglingTargets: [],
      existingLayouts: [],
      componentSource: "Ownership Transfer Dashboard",
      existingComponents: [
        { className: "metric-card", declarations: ["background: #fff"] },
      ],
    });
    expect(out).toContain("EXISTING COMPONENTS");
    expect(out).toContain(".metric-card { background: #fff }");
    expect(out.toLowerCase()).toContain("follow the request instead");
  });

  it("omits the components block when no screen has a vocabulary yet", () => {
    const out = formatScreenGenerationContext({
      existingScreens: [{ key: "home", name: "Home" }],
      danglingTargets: [],
      existingLayouts: [],
      componentSource: null,
      existingComponents: [],
    });
    expect(out).not.toContain("EXISTING COMPONENTS");
  });
});
