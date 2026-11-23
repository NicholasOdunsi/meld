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
      "<div>\n  <p>a</p>\n</div>",
      "<div>\n  <i>x</i>\n</div>",
      "<section> <b>x</b></section>",
      "<ul>\n  <li>a</li>\n</ul>",
      "<nav>\n  <a>x</a>\n</nav>",
    ])
      expect(text(source)).toEqual({ editable: false, value: null });
  });
  it("never offers an empty Text field on replaced, foreign or structural elements", () => {
    for (const source of [
      "<div></div>",
      "<ul></ul>",
      "<select></select>",
      "<svg></svg>",
      "<canvas></canvas>",
      "<video></video>",
      "<iframe></iframe>",
      "<object></object>",
    ])
      expect(text(source)?.editable, source).toBe(source === "<div></div>");
    const table = "<table><tr></tr></table>";
    expect(
      text(table, table.indexOf("<tr>"), table.indexOf("</table>"))?.editable,
    ).toBe(false);
    const svg = "<svg><path></path><text></text></svg>";
    expect(
      text(svg, svg.indexOf("<path>"), svg.indexOf("<text>"))?.editable,
    ).toBe(false);
    expect(
      text(svg, svg.indexOf("<text>"), svg.indexOf("</svg>")),
    ).toEqual({ editable: true, value: "" });
  });
  it.each([
    [
      '<h2>FEATURED <span class="accent">BIKES.</span></h2>',
      '<h2> <span class="accent">BIKES.</span></h2>',
      '<h2>NEW <span class="accent">BIKES.</span></h2>',
    ],
    [
      '<h2>\n    READY TO <span class="accent">RIDE?</span>\n  </h2>',
      '<h2>\n     <span class="accent">RIDE?</span>\n  </h2>',
      '<h2>\n     NEW <span class="accent">RIDE?</span>\n  </h2>',
    ],
    [
      "<h2>\n  CHASE THE<br>\n  <span>FREEDOM.</span>\n</h2>",
      "<h2>\n  <br>\n  <span>FREEDOM.</span>\n</h2>",
      "<h2>\n  NEW <br>\n  <span>FREEDOM.</span>\n</h2>",
    ],
    [
      '<a class="logo">VELO<span>X</span></a>',
      '<a class="logo"><span>X</span></a>',
      '<a class="logo">NEW<span>X</span></a>',
    ],
    [
      "<button><svg></svg> Go</button>",
      "<button><svg></svg> </button>",
      "<button><svg></svg> NEW</button>",
    ],
  ])("a cleared run next to an element takes text again: %j", (source, cleared, typed) => {
    expect(edit(source, "text", "")).toBe(cleared);
    expect(text(cleared)).toEqual({ editable: true, value: "" });
    expect(edit(cleared, "text", "NEW")).toBe(typed);
    expect(text(typed)).toEqual({ editable: true, value: "NEW" });
    // The typed text lands inside the element, before its end tag.
    const patch = node(cleared)!.patch({ field: "text", value: "NEW" })!;
    expect(patch.from).toBeGreaterThanOrEqual(cleared.indexOf(">") + 1);
    expect(patch.to).toBeLessThanOrEqual(cleared.lastIndexOf("</"));
    expect(edit(cleared, "text", "")).toBe(cleared);
  });
});
describe("several text runs in one element", () => {
  const inspect = (source: string) => node(source)?.inspect().text;
  const write = (source: string, value: string, index?: number) => {
    const patch = node(source)?.patch({ field: "text", value, index });
    return patch ? spliceAt(source, patch) : null;
  };
  const hero = '<h1>RIDE<br>BEYOND<br><span class="accent">LIMITS.</span></h1>';
  const pasted =
    '<h1>\n      RIDE<br>\n      BEYOND<br>\n      <span class="accent">LIMITS.</span>\n    </h1>';
  it("reports every run of the hero heading, in order, and edits only the chosen one", () => {
    for (const source of [hero, pasted, "<h1>RIDE<br>BEYOND<br>\n        <span>LIMITS.</span>\n      </h1>"])
      expect(inspect(source)).toEqual({ editable: true, value: "RIDE", runs: ["RIDE", "BEYOND"] });
    expect(write(hero, "FURTHER", 1)).toBe(
      '<h1>RIDE<br>FURTHER<br><span class="accent">LIMITS.</span></h1>',
    );
    expect(write(hero, "GO", 0)).toBe(
      '<h1>GO<br>BEYOND<br><span class="accent">LIMITS.</span></h1>',
    );
    // The pasted page keeps its indentation; only the second line changes.
    expect(write(pasted, "FURTHER", 1)).toBe(
      '<h1>\n      RIDE<br>\n      FURTHER<br>\n      <span class="accent">LIMITS.</span>\n    </h1>',
    );
    expect(inspect(write(pasted, "FURTHER", 1)!)).toEqual({
      editable: true,
      value: "RIDE",
      runs: ["RIDE", "FURTHER"],
    });
    // A message without an index edits the first run (the one `value` shows).
    expect(write(hero, "GO")).toBe(write(hero, "GO", 0));
  });
  it("keeps a heading with one run as one Text field, without runs", () => {
    const chase = "<h2>CHASE THE<br><span>FREEDOM.</span></h2>";
    expect(inspect(chase)).toEqual({ editable: true, value: "CHASE THE" });
    expect(write(chase, "RUN TO", 0)).toBe("<h2>RUN TO<br><span>FREEDOM.</span></h2>");
    expect(write(chase, "RUN TO", 1)).toBeNull();
  });
  it("rejects a run index that does not exist", () => {
    for (const index of [2, 7, -1, 1.5, 8])
      expect(write(hero, "x", index), String(index)).toBeNull();
  });
  it("writes each run's entities and keeps its own whitespace", () => {
    const source = "<p>\n  Fish &amp; Chips<br>\n  <i>x</i> and more\n</p>";
    expect(inspect(source)).toEqual({ editable: true, value: "Fish & Chips", runs: ["Fish & Chips", "and more"] });
    expect(write(source, "A < B", 1)).toBe("<p>\n  Fish &amp; Chips<br>\n  <i>x</i> A &lt; B\n</p>");
  });
  it("edits up to eight runs; more are read-only with the first run shown", () => {
    const lines = (n: number) => `<p>${Array.from({ length: n }, (_, i) => `L${i + 1}`).join("<br>")}</p>`;
    expect(inspect(lines(8))).toEqual({
      editable: true,
      value: "L1",
      runs: ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"],
    });
    expect(write(lines(8), "last", 7)).toBe(lines(7).replace("</p>", "<br>last</p>"));
    expect(inspect(lines(9))).toEqual({ editable: false, value: "L1 …" });
    expect(write(lines(9), "x", 0)).toBeNull();
  });
  it("keeps whitespace-preserving runs editable only when every run is lossless", () => {
    expect(inspect("<pre>a<br>b</pre>")).toEqual({ editable: true, value: "a", runs: ["a", "b"] });
    expect(write("<pre>a<br>b</pre>", "c", 1)).toBe("<pre>a<br>c</pre>");
    expect(inspect("<pre>a<br>b  c</pre>")).toEqual({ editable: false, value: "a …" });
  });
  it("only text takes an index", () => {
    expect(node(hero)!.patch({ field: "width", value: "20", index: 0 })).toBeNull();
  });
});
describe("text tags holding only elements", () => {
  const text = (source: string) => node(source)?.inspect().text;
  it.each([
    ["<li><a>Home</a></li>", "<li>NEW<a>Home</a></li>"],
    ["<a><img></a>", "<a>NEW<img></a>"],
    ['<li>\n  <a href="#">Home</a>\n</li>', '<li>\n  NEW <a href="#">Home</a>\n</li>'],
  ])("shows an empty Text field and types before the child: %j", (source, typed) => {
    expect(text(source)).toEqual({ editable: true, value: "" });
    expect(edit(source, "text", "NEW")).toBe(typed);
    // Valid markup: the child is still a child, and the element now reads the typed text.
    expect(text(typed)).toEqual({ editable: true, value: "NEW" });
    expect(edit(source, "text", "")).toBe(source);
  });
  it("never offers one on audio", () => {
    for (const source of ["<audio></audio>", '<audio><source src="a.mp3"></audio>', "<audio>\n  <source>\n</audio>"])
      expect(text(source), source).toEqual({ editable: false, value: null });
  });
});

describe("encoded whitespace around direct text", () => {
  it.each(["&#32;", "&#x20;", "&#9;", "&#10;"])("keeps %s separators next to inline children", (space) => {
    const source = `<h2>FEATURED${space}<span>BIKES.</span></h2>`;
    const next = edit(source, "text", "NEW");
    expect(next).toMatch(/NEW[ \t\n]<span>BIKES\.<\/span>/);
    expect(node(next!)?.inspect().text).toEqual({ editable: true, value: "NEW" });
  });
});

describe("reserved empty-run marker", () => {
  it("ignores author comments and recognizes only the exact reserved marker", () => {
    const source = "<h1>A<!-- comment --><br><!-- orion-text-run --><!--orion-text-run-extra-->B</h1>";
    expect(node(source)?.inspect().text).toEqual({ editable: true, value: "A", runs: ["A", "B"] });
    const slots = "<h1>A<br><!--orion-text-run--><span>x</span></h1>";
    expect(node(slots)?.inspect().text).toEqual({ editable: true, value: "A", runs: ["A", ""] });
    const patch = node(slots)?.patch({ field: "text", value: "", index: 1 });
    expect(patch && spliceAt(slots, patch)).toBe(slots);
  });
});

it("replaces a lone reserved HTML marker after other runs were removed in Code", () => {
  const source = "<h1><!--orion-text-run--></h1>";
  expect(edit(source, "text", "NEW")).toBe("<h1>NEW</h1>");
  expect(node(edit(source, "text", "NEW")!)?.inspect().text).toEqual({ editable: true, value: "NEW" });
});
