import { describe, expect, it } from "vitest";
import { locateHtml } from "./html";
import { spliceAt } from "./patch";
import { FIELDS, type Field } from "./types";
function node(source: string, start = 0, end = source.length) {
  return locateHtml(source, {
    file: "index.html",
    start,
    end,
  });
}
function edit(source: string, field: Field, value: string) {
  const patch = node(source)?.patch({
    field,
    value,
  });
  return patch ? spliceAt(source, patch) : null;
}
describe("literal HTML", () => {
  it("preserves siblings, UTF16, CRLF and comments", () => {
    const source = "<!--😀-->\r\n<p>😀</p><p>Hello</p>";
    const start = source.indexOf("<p>Hello");
    const patch = node(source, start)?.patch({
      field: "text",
      value: "A & <B>",
    });
    expect(patch && spliceAt(source, patch)).toBe(
      source.slice(0, start) + "<p>A &amp; &lt;B&gt;</p>",
    );
    expect(node(source, start, source.length - 1)).toBeNull();
  });
  it("edits every style field and declines invalid values", () => {
    for (const field of FIELDS.filter((f) => f !== "text")) {
      const value =
        field === "color" || field === "backgroundColor"
          ? "#123456"
          : field === "fontWeight"
            ? "700"
            : field === "fontFamily"
              ? "mono"
              : "12";
      expect(edit("<b>x</b>", field, value)).toContain("style=");
      expect(edit("<b>x</b>", field, "bad;evil")).toBeNull();
    }
  });
  it("declines raw text without showing it", () => {
    for (const source of [
      "<script>alert(1)</script>",
      "<textarea>x</textarea>",
      "<style>b{}</style>",
    ])
      expect(node(source)?.inspect().text).toEqual({
        editable: false,
        value: null,
      });
  });
  it("preserves quoted CSS semicolons and unrelated expressions", () => {
    expect(
      edit(
        `<b style='content:"a;b"; width: 1px; color:var(--x)'>x</b>`,
        "width",
        "20",
      ),
    ).toBe(
      `<b style="content:&quot;a;b&quot;; width: 20px; color:var(--x)">x</b>`,
    );
  });
  it("declines duplicate attrs and declarations and dynamic ownership", () => {
    for (const source of [
      '<b style="width:1px" STYLE="width:2px">x</b>',
      '<b style="width:1px;width:2px">x</b>',
      '<b style="width:calc(2px + 1px)">x</b>',
      '<b style="width:var(--x)">x</b>',
      '<b style="width:env(x)">x</b>',
      '<b class="w-[1px]" style="width:2px">x</b>',
    ]) {
      expect(node(source)?.inspect().width.editable).toBe(false);
      expect(edit(source, "width", "20")).toBeNull();
    }
  });
  it("handles unquoted attrs and quoted terminators", () => {
    expect(edit('<b title=">" style=width:1px>x</b>', "width", "20")).toBe(
      '<b title=">" style="width:20px">x</b>',
    );
    expect(edit('<b title=">">x</b>', "width", "20")).toBe(
      '<b title=">" style="width: 20px">x</b>',
    );
  });
  it("uses utilities and custom class fallback", () => {
    expect(
      edit('<b class="custom w-[1px] hover:w-[3px]">x</b>', "width", "20"),
    ).toBe('<b class="custom w-[20px] hover:w-[3px]">x</b>');
    expect(edit('<b class="custom">x</b>', "width", "20")).toBe(
      '<b class="custom" style="width: 20px">x</b>',
    );
  });
  it("preserves parsed entities and repeated text edits", () => {
    const source = "<b>A &amp; B</b>";
    expect(node(source)?.inspect().text.value).toBe("A & B");
    const next = edit(source, "text", "😀 & <x>")!;
    expect(node(next)?.inspect().text.value).toBe("😀 & <x>");
    expect(edit(next, "text", "again")).toBe("<b>again</b>");
  });
  it("disables only ambiguous CSS fields", () => {
    const source =
      '<b style="width:1px; width:2px; height:3px; color:var(--x)">x</b>';
    expect(node(source)?.inspect().width.editable).toBe(false);
    expect(node(source)?.inspect().height).toEqual({
      editable: true,
      value: "3",
    });
    expect(edit(source, "height", "4")).toBe(
      '<b style="width:1px; width:2px; height:4px; color:var(--x)">x</b>',
    );
  });
  it("declines synthetic nodes and unsupported positions", () => {
    expect(node("hello")).toBeNull();
    expect(node("<b>x</b>", -1)).toBeNull();
    expect(node("<b>x</b>", 0, 7)).toBeNull();
  });
  it("preserves style comments and importance", () => {
    expect(
      edit(
        '<b style="/* first */ width : 1px !important; /* last */">x</b>',
        "width",
        "8",
      ),
    ).toBe('<b style="/* first */ width : 8px !important; /* last */">x</b>');
  });
  it("declines duplicate class attributes", () => {
    const source = '<b class="custom" CLASS="w-[2px]">x</b>';
    expect(node(source)?.inspect().width.editable).toBe(false);
    expect(edit(source, "width", "3")).toBeNull();
  });
  it("keeps slash in unquoted values when inserting attributes", () => {
    expect(edit("<img class=custom/>", "width", "20")).toBe(
      '<img class=custom/ style="width: 20px">',
    );
    expect(edit('<img class="custom"/>', "width", "20")).toBe(
      '<img class="custom" style="width: 20px"/>',
    );
  });
  it("declines CSS ownership affected by shorthand and longhand declarations", () => {
    for (const [style, field] of [
      ["font:12px serif", "fontSize"],
      ["font:12px serif", "fontWeight"],
      ["background:red", "backgroundColor"],
      ["all:inherit", "width"],
      ["padding-left:3px", "padding"],
      ["row-gap:1px", "gap"],
      ["border-top-left-radius:3px", "borderRadius"],
    ] as const) {
      const source = `<b style="${style}">x</b>`;
      expect(node(source)?.inspect()[field].editable).toBe(false);
      expect(edit(source, field, "20")).toBeNull();
    }
  });
  it("declines malformed CSS but accepts inert authored script siblings", () => {
    expect(
      edit('<b style="width: 2px; broken">x</b>', "width", "20"),
    ).toBeNull();
    const source = "<script>throw 1</script><b>x</b>";
    expect(node(source, source.indexOf("<b>"))?.inspect().text.value).toBe("x");
  });
});
describe("one text run next to other children", () => {
  const text = (source: string, start?: number, end?: number) =>
    node(source, start, end)?.inspect().text;
  it.each([
    [
      '<h2>FEATURED <span class="accent">BIKES.</span></h2>',
      "FEATURED",
      "NEW",
      '<h2>NEW <span class="accent">BIKES.</span></h2>',
    ],
    [
      "<h2>CHASE THE<br><span>FREEDOM.</span></h2>",
      "CHASE THE",
      "RUN TO",
      "<h2>RUN TO<br><span>FREEDOM.</span></h2>",
    ],
    [
      '<h2>\n    READY TO <span class="accent">RIDE?</span>\n  </h2>',
      "READY TO",
      "SET TO",
      '<h2>\n    SET TO <span class="accent">RIDE?</span>\n  </h2>',
    ],
    [
      '<h2>\n      CHASE THE<br>\n      <span class="accent">FREEDOM.</span>\n    </h2>',
      "CHASE THE",
      "GO",
      '<h2>\n      GO<br>\n      <span class="accent">FREEDOM.</span>\n    </h2>',
    ],
    [
      '<a href="#" class="logo">VELO<span>X</span></a>',
      "VELO",
      "MOTO",
      '<a href="#" class="logo">MOTO<span>X</span></a>',
    ],
    [
      '<a href="#">Explore <svg viewBox="0 0 1 1"><path d="M0 0"/></svg></a>',
      "Explore",
      "Shop",
      '<a href="#">Shop <svg viewBox="0 0 1 1"><path d="M0 0"/></svg></a>',
    ],
    [
      "<button><svg></svg> Go</button>",
      "Go",
      "Stop",
      "<button><svg></svg> Stop</button>",
    ],
    ["<li>Two <b>x</b></li>", "Two", "Three", "<li>Three <b>x</b></li>"],
    [
      "<p><!-- note -->\n  Hello <!-- tail -->\n</p>",
      "Hello",
      "Bye",
      "<p><!-- note -->\n  Bye <!-- tail -->\n</p>",
    ],
    [
      "<p>\n      At VeloX, we believe\n      cycling is more.\n    </p>",
      "At VeloX, we believe cycling is more.",
      "Short",
      "<p>\n      Short\n    </p>",
    ],
    ["<p>a { b < c</p>", "a { b < c", "q < r & {s}", "<p>q &lt; r &amp; {s}</p>"],
  ])("edits the one run of %j", (source, shown, typed, result) => {
    expect(text(source)).toEqual({ editable: true, value: shown });
    expect(edit(source, "text", typed)).toBe(result);
    // The edit stays inside the element: after its start tag, before its end tag.
    const patch = node(source)!.patch({ field: "text", value: typed })!;
    expect(patch.from).toBeGreaterThanOrEqual(source.indexOf(">") + 1);
    expect(patch.to).toBeLessThanOrEqual(source.lastIndexOf("</"));
    // Writing back the shown text changes nothing a reader can see.
    expect(text(edit(source, "text", shown)!)).toEqual({
      editable: true,
      value: shown,
    });
  });
  it("shows entities decoded and writes them back as characters", () => {
    const source = "<p>Fish &amp; Chips&nbsp;&rarr; go <i>x</i></p>";
    expect(text(source)).toEqual({
      editable: true,
      value: "Fish & Chips\u00a0→ go",
    });
    expect(edit(source, "text", "Fish & Chips\u00a0→ go")).toBe(
      "<p>Fish &amp; Chips\u00a0→ go <i>x</i></p>",
    );
    expect(edit(source, "text", "A & <b>")).toBe(
      "<p>A &amp; &lt;b&gt; <i>x</i></p>",
    );
  });
  it("shows several runs read-only, first run first", () => {
    for (const source of [
      "<h1>RIDE<br>BEYOND<br><span>LIMITS.</span></h1>",
      "<h1>\n  RIDE<br>\n  BEYOND<br>\n  <span>LIMITS.</span>\n</h1>",
    ]) {
      expect(text(source)).toEqual({ editable: false, value: "RIDE …" });
      expect(node(source)!.patch({ field: "text", value: "x" })).toBeNull();
    }
  });
  it("keeps whitespace-preserving text read-only unless editing it is lossless", () => {
    expect(text("<pre>a  b</pre>")).toEqual({ editable: false, value: "a b" });
    const code = "<pre><code>x\n  y</code></pre>";
    expect(text(code, code.indexOf("<code>"), code.indexOf("</pre>"))).toEqual(
      { editable: false, value: "x y" },
    );
    expect(text('<p style="white-space: pre-wrap">a\n b</p>')?.editable).toBe(
      false,
    );
    expect(text('<p class="whitespace-pre-line">a\n b</p>')?.editable).toBe(
      false,
    );
    expect(edit("<pre>hello</pre>", "text", "bye")).toBe("<pre>bye</pre>");
    expect(edit('<p style="white-space:pre">one</p>', "text", "two")).toBe(
      '<p style="white-space:pre">two</p>',
    );
  });
  it("lets an emptied element take text again", () => {
    expect(text("<p></p>")).toEqual({ editable: true, value: "" });
    const cleared = edit("<p>Hello</p>", "text", "")!;
    expect(cleared).toBe("<p></p>");
    expect(edit(cleared, "text", "Hi")).toBe("<p>Hi</p>");
    const multi = edit("<p>\n  Hello\n</p>", "text", "")!;
    expect(text(multi)).toEqual({ editable: true, value: "" });
    expect(edit(multi, "text", "Hi")).toBe("<p>\n  Hi\n</p>");
  });
  it("hides text for elements that hold none", () => {
    for (const source of [
      "<img>",
      "<br>",
      "<div><p>a</p><p>b</p></div>",
      "<h2><span>X</span></h2>",
      "<div>\n  <p>a</p>\n</div>",
    ])
      expect(text(source)).toEqual({ editable: false, value: null });
  });
});
