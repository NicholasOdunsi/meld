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

  it("tells the model to reuse an existing key to change that screen", () => {
    // With nothing selected, this list is the only thing that can tell the
    // model "vehicle_detail already exists, and changing it means saying so".
    // Read as link targets only, it invented a fresh slug and built a second
    // Vehicle Detail beside the one that was already wired up.
    const text = formatScreenGenerationContext({
      existingScreens: [{ key: "vehicle_detail", name: "Vehicle Detail" }],
      danglingTargets: [],
      existingLayouts: [],
    });
    expect(text).toMatch(/reuse its EXACT key/);
    expect(text).toMatch(/updates it/i);
  });

  it("shows the reference screen's actual markup, not just its class names", () => {
    // The whole bug: the model was handed a name and six CSS fragments and
    // asked to "match" a screen it had never seen. It could not know the brand
    // name, the copy, the shell, or the proportions -- so it invented them,
    // and every new screen drifted further from the first.
    const text = formatScreenGenerationContext({
      existingScreens: [{ key: "register", name: "Register" }],
      danglingTargets: [],
      existingLayouts: [],
      referenceScreen: {
        name: "Register",
        markup: '<aside class="reg__hero"><h1>MoveOn</h1></aside>',
        styles: ".reg__hero { padding: 48px 44px }",
      },
    });
    expect(text).toContain('<aside class="reg__hero">');
    // The brand name only exists in the markup. If the markup is not there,
    // the next screen cannot possibly get the company name right.
    expect(text).toContain("MoveOn");
    expect(text).toContain(".reg__hero { padding: 48px 44px }");
  });

  it("tells the model to copy the reference rather than reinterpret it", () => {
    const text = formatScreenGenerationContext({
      existingScreens: [],
      danglingTargets: [],
      existingLayouts: [],
      referenceScreen: { name: "Register", markup: "<main>x</main>", styles: "" },
    });
    expect(text).toMatch(/REFERENCE SCREEN/);
    expect(text).toMatch(/same/i);
  });

  it("puts linking information ahead of the bulky reference screen", () => {
    // Ordering is a safety property, not a style choice. Anything that trims
    // this text trims it from the end, and the reference screen is by far the
    // largest block. If it went first it would push the key list off the end
    // -- which is exactly what happened: a truncated prompt hid the pending
    // "prospect_schedule_test" key, the model invented "schedule_test", and
    // every button on the previous screen led nowhere.
    //
    // Losing reference fidelity degrades how a screen looks. Losing the key
    // list breaks the prototype. So the small, essential block goes first and
    // the big, best-effort one goes last.
    const text = formatScreenGenerationContext({
      existingScreens: [{ key: "register", name: "Register" }],
      danglingTargets: ["prospect_schedule_test"],
      existingLayouts: [],
      referenceScreen: {
        name: "Register",
        markup: "<main>reference markup body</main>",
        styles: ".x{}",
      },
    });
    expect(text.indexOf("prospect_schedule_test")).toBeLessThan(
      text.indexOf("reference markup body"),
    );
    expect(text.indexOf("EXISTING SCREENS")).toBeLessThan(
      text.indexOf("REFERENCE SCREEN"),
    );
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
