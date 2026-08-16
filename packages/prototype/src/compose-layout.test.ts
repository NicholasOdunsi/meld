import { describe, expect, it } from "vitest";
import { injectSlot, namespaceLayoutActionId, composeScreen } from "./compose-layout";

const shell = '<aside><a data-meld-action="nav-home">Home</a></aside><main data-meld-slot></main>';

describe("injectSlot", () => {
  it("injects content into the single slot element", () => {
    const r = injectSlot(shell, "<p>content</p>");
    expect(r.ok).toBe(true);
    expect(r.markup).toContain("<main data-meld-slot><p>content</p></main>");
    expect(r.markup).toContain("nav-home");
  });
  it("reports not-ok when there is no slot", () => {
    expect(injectSlot("<main></main>", "x").ok).toBe(false);
  });
  it("reports not-ok when there are two slots", () => {
    expect(injectSlot("<a data-meld-slot></a><b data-meld-slot></b>", "x").ok).toBe(false);
  });
});

describe("namespaceLayoutActionId", () => {
  it("prefixes the action id with layout__", () => {
    expect(namespaceLayoutActionId("nav-home")).toBe("layout__nav-home");
  });
});

describe("composeScreen", () => {
  const base = { id: "s1", name: "S1", screenKey: "home", styles: "", script: null } as const;

  it("standalone screen: markup and routes unchanged, no layout styles", () => {
    const r = composeScreen({
      ...base, markup: "<h1>hi</h1>",
      actions: [{ id: "go", label: "Go", targetScreenId: "s2", targetScreenKey: null }],
      layout: null,
    });
    expect(r.markup).toBe("<h1>hi</h1>");
    expect(r.layoutStyles).toBeNull();
    expect(r.routes).toEqual({ go: "s2" });
  });

  it("layout screen: shell wraps content, nav ids namespaced, routes merged", () => {
    const r = composeScreen({
      ...base, markup: "<h1>hi</h1>",
      actions: [{ id: "go", label: "Go", targetScreenId: "s2", targetScreenKey: null }],
      layout: {
        id: "L1", shellStyles: "aside{color:red}", shellMarkup: shell,
        actions: [{ id: "nav-home", label: "Home", targetScreenId: "s1", targetScreenKey: "home" }],
      },
    });
    expect(r.markup).toContain('data-meld-action="layout__nav-home"');
    expect(r.markup).toContain("<h1>hi</h1>");
    expect(r.layoutStyles).toEqual({ id: "L1", css: "aside{color:red}" });
    expect(r.routes).toEqual({ go: "s2", "layout__nav-home": "s1" });
  });

  it("does not corrupt a content action whose id collides with a layout action id", () => {
    const collidingShell =
      '<aside><a data-meld-action="back">Back to menu</a></aside><main data-meld-slot></main>';
    const r = composeScreen({
      ...base,
      markup: '<button data-meld-action="back">Undo</button>',
      actions: [{ id: "back", label: "Undo", targetScreenId: "s-content-target", targetScreenKey: null }],
      layout: {
        id: "L1",
        shellStyles: "",
        shellMarkup: collidingShell,
        actions: [{ id: "back", label: "Back to menu", targetScreenId: "s-layout-target", targetScreenKey: null }],
      },
    });

    // The content element keeps its own, un-namespaced action id...
    expect(r.markup).toContain('<button data-meld-action="back">Undo</button>');
    // ...while the shell's nav element is namespaced.
    expect(r.markup).toContain('<a data-meld-action="layout__back">Back to menu</a>');
    // Both routes survive, pointing at their own distinct targets.
    expect(r.routes).toEqual({ back: "s-content-target", "layout__back": "s-layout-target" });
  });
});
