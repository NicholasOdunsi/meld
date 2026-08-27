// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { buildPrototypeDocument } from "./prototype-document";

function render(html: string) {
  // The <body data-meld-start="..."> tag itself (not just its children) is
  // stripped out below, so the attribute the harness reads on init would be
  // lost -- capture it first and re-apply it to the freshly implied <body>.
  const start = html.match(/<body data-meld-start="([^"]*)">/)?.[1];
  document.documentElement.innerHTML = html
    .replace(/^[\s\S]*?<body[^>]*>/, "")
    .replace(/<\/body>[\s\S]*$/, "");
  if (start) document.body.setAttribute("data-meld-start", start);
  // execute the harness <script>
  const scripts = Array.from(document.querySelectorAll("script:not([type])"));
  for (const s of scripts) {
    const fn = new Function(s.textContent ?? "");
    fn();
  }
}

describe("prototype document harness (runtime, jsdom)", () => {
  it("marks the current screen's nav control active and fills the breadcrumb", () => {
    const shell =
      '<nav><a data-meld-action="nav-a">A</a><a data-meld-action="nav-b">B</a></nav>' +
      '<span data-meld-crumb></span><main data-meld-slot></main>';
    const layout = {
      id: "L1",
      shellMarkup: shell,
      shellStyles: "",
      actions: [
        { id: "nav-a", label: "A", targetScreenId: "s1", targetScreenKey: "a" },
        { id: "nav-b", label: "B", targetScreenId: "s2", targetScreenKey: "b" },
      ],
    };
    const base = { styles: "", script: null };
    const html = buildPrototypeDocument({
      startScreenId: "s1",
      tokenCss: "",
      screens: [
        { ...base, id: "s1", name: "Alpha", screenKey: "a", markup: "<p>a</p>", actions: [], layout },
        { ...base, id: "s2", name: "Beta", screenKey: "b", markup: "<p>b</p>", actions: [], layout },
      ],
    });
    render(html);
    const s1 = document.querySelector('[data-meld-screen="s1"]')!;
    // start screen s1: its nav-a (namespaced layout__nav-a) points at s1 → active; crumb = "Alpha"
    expect(s1.querySelector('[data-meld-action="layout__nav-a"]')!.hasAttribute("data-meld-active")).toBe(true);
    expect(s1.querySelector('[data-meld-action="layout__nav-b"]')!.hasAttribute("data-meld-active")).toBe(false);
    expect(s1.querySelector("[data-meld-crumb]")!.textContent).toBe("Alpha");
  });

  it("re-applies active-state and breadcrumb after navigating to a second screen", () => {
    const shell =
      '<nav><a data-meld-action="nav-a">A</a><a data-meld-action="nav-b">B</a></nav>' +
      '<span data-meld-crumb></span><main data-meld-slot></main>';
    const layout = {
      id: "L1",
      shellMarkup: shell,
      shellStyles: "",
      actions: [
        { id: "nav-a", label: "A", targetScreenId: "s1", targetScreenKey: "a" },
        { id: "nav-b", label: "B", targetScreenId: "s2", targetScreenKey: "b" },
      ],
    };
    const base = { styles: "", script: null };
    const html = buildPrototypeDocument({
      startScreenId: "s1",
      tokenCss: "",
      screens: [
        { ...base, id: "s1", name: "Alpha", screenKey: "a", markup: "<p>a</p>", actions: [], layout },
        { ...base, id: "s2", name: "Beta", screenKey: "b", markup: "<p>b</p>", actions: [], layout },
      ],
    });
    render(html);
    const s1 = document.querySelector('[data-meld-screen="s1"]')!;
    const navB = s1.querySelector('[data-meld-action="layout__nav-b"]')! as HTMLElement;
    navB.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    const s2 = document.querySelector('[data-meld-screen="s2"]')!;
    expect(s2.querySelector('[data-meld-action="layout__nav-b"]')!.hasAttribute("data-meld-active")).toBe(true);
    expect(s2.querySelector('[data-meld-action="layout__nav-a"]')!.hasAttribute("data-meld-active")).toBe(false);
    expect(s2.querySelector("[data-meld-crumb]")!.textContent).toBe("Beta");

    // Each screen carries its own copy of the shell markup (shared layouts are
    // static per-section markup, not one persistent chrome node), so the
    // active-state gate only rewrites the currently-shown section -- s1's
    // stale attributes from its earlier render are irrelevant while hidden.
    // Navigating back to it must recompute correctly.
    const navA = s2.querySelector('[data-meld-action="layout__nav-a"]')! as HTMLElement;
    navA.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(s1.querySelector('[data-meld-action="layout__nav-a"]')!.hasAttribute("data-meld-active")).toBe(true);
    expect(s1.querySelector('[data-meld-action="layout__nav-b"]')!.hasAttribute("data-meld-active")).toBe(false);
    expect(s1.querySelector("[data-meld-crumb]")!.textContent).toBe("Alpha");
  });

  it("does not mark a content action active even when its route target equals the current screen", () => {
    const shell =
      '<nav><a data-meld-action="nav-a">A</a></nav>' +
      '<span data-meld-crumb></span><main data-meld-slot></main>';
    const layout = {
      id: "L1",
      shellMarkup: shell,
      shellStyles: "",
      actions: [{ id: "nav-a", label: "A", targetScreenId: "s1", targetScreenKey: "a" }],
    };
    const base = { styles: "", script: null };
    const html = buildPrototypeDocument({
      startScreenId: "s1",
      tokenCss: "",
      screens: [
        {
          ...base,
          id: "s1",
          name: "Alpha",
          screenKey: "a",
          // A content control (self-refresh) whose target is the CURRENT
          // screen -- must never receive data-meld-active; only namespaced
          // layout__ nav controls are in scope for that attribute.
          markup: '<button data-meld-action="refresh">Refresh</button>',
          actions: [{ id: "refresh", label: "Refresh", targetScreenId: "s1" }],
          layout,
        },
      ],
    });
    render(html);
    const s1 = document.querySelector('[data-meld-screen="s1"]')!;
    expect(s1.querySelector('[data-meld-action="refresh"]')!.hasAttribute("data-meld-active")).toBe(false);
    expect(s1.querySelector('[data-meld-action="layout__nav-a"]')!.hasAttribute("data-meld-active")).toBe(true);
  });

  it("does not add active-state or breadcrumb behavior for a standalone (layout: null) screen", () => {
    const base = { styles: "", script: null };
    const html = buildPrototypeDocument({
      startScreenId: "s1",
      tokenCss: "",
      screens: [
        {
          ...base,
          id: "s1",
          name: "Alpha",
          screenKey: "a",
          markup: '<span data-meld-crumb></span><button data-meld-action="go">Go</button>',
          actions: [{ id: "go", label: "Go", targetScreenId: "s1" }],
          layout: null,
        },
      ],
    });
    render(html);
    const s1 = document.querySelector('[data-meld-screen="s1"]')!;
    expect(s1.hasAttribute("data-meld-layout")).toBe(false);
    expect(s1.querySelector('[data-meld-action="go"]')!.hasAttribute("data-meld-active")).toBe(false);
    expect(s1.querySelector("[data-meld-crumb]")!.textContent).toBe("");
  });

  it("posts meld:screen-changed with the new screenId when an in-prototype click navigates", () => {
    // Regression guard for the failure mode the brief calls out: report()
    // must fire from the CLICK path, not only from the host-initiated
    // meld:navigate message-listener path. A real jsdom click drives the
    // harness's actual navigation code, and we spy on window.postMessage
    // (jsdom's window === parent here, same as an un-nested prototype tab)
    // rather than asserting on the harness's source text.
    const html = buildPrototypeDocument({
      startScreenId: "s1",
      tokenCss: "",
      screens: [
        {
          styles: "",
          script: null,
          id: "s1",
          name: "Alpha",
          markup: '<button data-meld-action="go">Go</button>',
          actions: [{ id: "go", label: "Go", targetScreenId: "s2" }],
        },
        {
          styles: "",
          script: null,
          id: "s2",
          name: "Beta",
          markup: "<p>b</p>",
          actions: [],
        },
      ],
    });

    const postMessage = vi.spyOn(window, "postMessage");
    render(html);
    postMessage.mockClear(); // discard the initial-render report(s1) call

    const go = document.querySelector('[data-meld-action="go"]')! as HTMLElement;
    go.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(postMessage).toHaveBeenCalledWith(
      { type: "meld:screen-changed", screenId: "s2" },
      "*",
    );
    postMessage.mockRestore();
  });
});
