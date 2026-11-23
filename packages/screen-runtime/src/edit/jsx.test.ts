import { packages } from "@babel/standalone";
import { describe, expect, it } from "vitest";
import { locateJsx } from "./jsx";
import { spliceAt } from "./patch";
import type { Field } from "./types";
function locate(source: string) {
  const start = source.indexOf("<b");
  return locateJsx(source, {
    file: "App.tsx",
    start,
    end: source.lastIndexOf(">") + 1,
  });
}
function edit(source: string, field: Field, value: string) {
  const patch = locate(source)?.patch({ field, value });
  return patch ? spliceAt(source, patch) : null;
}
describe("JSX literal editing", () => {
  it("round trips escaped text and preserves UTF16 spans", () => {
    const source = 'const emoji="😀"; const view=<b>Hello</b>';
    const value = 'Click {here} & "say"';
    const result = edit(source, "text", value)!;
    expect(result).toBe(
      'const emoji="😀"; const view=<b>{' + JSON.stringify(value) + "}</b>",
    );
    expect(locate(result)?.inspect().text.value).toBe(value);
    expect(
      locateJsx(source, {
        file: "App.tsx",
        start: source.indexOf("<b"),
        end: source.length - 1,
      }),
    ).toBeNull();
  });
  it("rejects computed text, and shows two literal runs as two runs", () => {
    for (const text of ["{name}", 'hi {"x"} {name}'])
      expect(locate("<b>" + text + "</b>")?.inspect().text.editable).toBe(
        false,
      );
    expect(locate('<b>hi {"x"}</b>')?.inspect().text).toEqual({
      editable: true,
      value: "hi",
      runs: ["hi", "x"],
    });
  });
  it("preserves unrelated styles and multiline comments", () => {
    const source =
      '<b style={{\n color: "red", // note\n opacity: dynamic, /* tail */\n}}>ok</b>';
    expect(edit(source, "color", "#abcdef")).toBe(
      source.replace('"red"', '"#abcdef"'),
    );
    const changed = edit(source, "gap", "12")!;
    expect(changed).toContain('opacity: dynamic,gap:"12px", /* tail */');
    expect(locate(changed)?.inspect().gap.value).toBe("12");
  });
  it("handles each style family with inline fallback", () => {
    for (const [field, value] of Object.entries({
      color: "#abcdef",
      backgroundColor: "#abcdef",
      fontSize: "12",
      fontWeight: "700",
      padding: "12",
      gap: "12",
      borderRadius: "12",
      width: "12",
      height: "12",
    }))
      expect(edit("<b>ok</b>", field as Field, value)).toContain(
        "style={{" + field + ":",
      );
  });
  it("uses literal utility classes and disables cascade ambiguity", () => {
    expect(
      edit('<b className="text-red-500 custom">ok</b>', "color", "#abcdef"),
    ).toBe('<b className={"text-[#abcdef] custom"}>ok</b>');
    expect(
      locate(
        '<b className="text-red-500" style={{color:"red"}}>ok</b>',
      )?.inspect().color.editable,
    ).toBe(false);
  });
  it("declines ambiguous styles and attributes", () => {
    for (const attr of [
      "{...props}",
      "style={styles}",
      "className={classes}",
      "style={{...styles}}",
      "style={{[key]:1}}",
      "style={{color:one}}",
      'style={{color:"red",color:"blue"}}',
      "style={{color}}",
      "style={{color(){}}}",
      'style={{color:"red"}} style={{}}',
    ])
      expect(locate("<b " + attr + ">ok</b>")?.inspect().color.editable).toBe(
        false,
      );
  });
  it("rejects invalid syntax and component targets", () => {
    expect(locate("<b broken=>ok</b>")).toBeNull();
    expect(
      locateJsx("<Box>ok</Box>", { file: "App.tsx", start: 0, end: 13 }),
    ).toBeNull();
  });

  it("declines dynamic CSS functions including comments and escaped identifiers", () => {
    for (const value of [
      "var(--brand)",
      "VAR(--brand)",
      "env(safe-area-inset-top)",
      "calc(2px + 3px)",
      "attr(data-size px)",
      "v/**/ar(--brand)",
      "var/**/(--brand)",
      String.raw`v\61r(--brand)`,
    ]) {
      const source = "<b style={{color:" + JSON.stringify(value) + "}}>ok</b>";
      expect(locate(source)?.inspect().color.editable, value).toBe(false);
      expect(edit(source, "color", "#abcdef"), value).toBeNull();
    }
  });
  it("inserts into empty and commented objects with valid trailing commas", () => {
    for (const object of [
      "{}",
      "{/* note */}",
      "{// note\n}",
      "{opacity: 1}",
      "{opacity: 1,}",
      "{opacity: 1 // note\n}",
      "{opacity: 1, // note\n}",
    ]) {
      const source = "<b style={" + object + "}>ok</b>";
      const result = edit(source, "gap", "8")!;
      expect(result).not.toBeNull();
      expect(locate(result)?.inspect().gap).toEqual({
        editable: true,
        value: "8",
      });
      expect(result).toContain(object.includes("note") ? "note" : "ok");
    }
  });
  it("selects exact siblings in typed TSX and respects the filename parser", () => {
    const source =
      'const label: string = "😀"; const view = <section><b>same</b><b>same</b></section>;';
    const text = "<b>same</b>";
    const start = source.lastIndexOf(text);
    const range = {
      file: "components/View.tsx",
      start,
      end: start + text.length,
    };
    const target = locateJsx(source, range)!;
    const patch = target.patch({ field: "text", value: "second" })!;
    expect(spliceAt(source, patch)).toBe(
      source.slice(0, start) + '<b>{"second"}</b></section>;',
    );
    expect(locateJsx(source, { ...range, end: range.end - 1 })).toBeNull();
    expect(
      locateJsx(source, { ...range, file: "components/View.jsx" }),
    ).toBeNull();
    const other = "<b>other file</b>";
    expect(
      locateJsx(other, {
        file: "Other.jsx",
        start: 0,
        end: other.length,
      })?.inspect().text.value,
    ).toBe("other file");
  });
});
describe("JSX: one text run next to other children", () => {
  const whole = (source: string) =>
    locateJsx(source, { file: "App.tsx", start: 0, end: source.length });
  const text = (source: string) => whole(source)?.inspect().text;
  const write = (source: string, value: string) => {
    const patch = whole(source)?.patch({ field: "text", value });
    return patch ? spliceAt(source, patch) : null;
  };
  it.each([
    [
      '<h2>FEATURED <span className="accent">BIKES.</span></h2>',
      "FEATURED",
      "NEW",
      '<h2>{"NEW "}<span className="accent">BIKES.</span></h2>',
    ],
    [
      "<h2>\n  CHASE THE<br/>\n  <span>FREEDOM.</span>\n</h2>",
      "CHASE THE",
      "GO",
      '<h2>\n  {"GO"}<br/>\n  <span>FREEDOM.</span>\n</h2>',
    ],
    [
      "<h2>\n    READY TO <span>RIDE?</span>\n  </h2>",
      "READY TO",
      "SET TO",
      '<h2>\n    {"SET TO "}<span>RIDE?</span>\n  </h2>',
    ],
    ["<a>Explore <svg/></a>", "Explore", "Shop", '<a>{"Shop "}<svg/></a>'],
    [
      "<button><svg/> Go</button>",
      "Go",
      "Stop",
      '<button><svg/>{" Stop"}</button>',
    ],
    ["<li>Two <b>x</b></li>", "Two", "Three", '<li>{"Three "}<b>x</b></li>'],
    [
      "<p>{/* note */}Hello <b>x</b></p>",
      "Hello",
      "Bye",
      '<p>{/* note */}{"Bye "}<b>x</b></p>',
    ],
    ['<p>{"Hi "}<b>x</b></p>', "Hi", "Yo", '<p>{"Yo "}<b>x</b></p>'],
    [
      "<p>\n   At VeloX\n   more\n  </p>",
      "At VeloX more",
      "Short",
      '<p>\n   {"Short"}\n  </p>',
    ],
    [
      "<p>a b <i>x</i></p>",
      "a b",
      'q < r & {s} "t"',
      '<p>{"q < r & {s} \\"t\\" "}<i>x</i></p>',
    ],
  ])("edits the one run of %j", (source, shown, typed, result) => {
    expect(text(source)).toEqual({ editable: true, value: shown });
    expect(write(source, typed)).toBe(result);
    expect(text(write(source, typed)!)).toEqual({
      editable: true,
      value: typed,
    });
    const patch = whole(source)!.patch({ field: "text", value: typed })!;
    expect(patch.from).toBeGreaterThanOrEqual(source.indexOf(">") + 1);
    expect(patch.to).toBeLessThanOrEqual(source.lastIndexOf("</"));
  });
  it("shows entities decoded", () => {
    const source = "<p>Fish &amp; Chips&nbsp;&rarr; go <i>x</i></p>";
    expect(text(source)).toEqual({
      editable: true,
      value: "Fish & Chips\u00a0→ go",
    });
    expect(write(source, "A & B")).toBe('<p>{"A & B "}<i>x</i></p>');
  });
  it("shows computed text read-only with its static text", () => {
    expect(text("<p>Hi {name}</p>")).toEqual({
      editable: false,
      value: "Hi …",
    });
    expect(text("<p>{name}</p>")).toEqual({ editable: false, value: "…" });
    expect(text("<p>{`Hi`}</p>")).toEqual({ editable: false, value: "…" });
    // Several runs next to computed text stay read-only too.
    expect(text("<h1>RIDE<br/>{name}<br/>BEYOND</h1>")).toEqual({
      editable: false,
      value: "RIDE …",
    });
    expect(write("<p>Hi {name}</p>", "x")).toBeNull();
  });
  it("keeps whitespace-preserving text read-only unless editing it is lossless", () => {
    expect(text("<pre>a  b</pre>")).toEqual({ editable: false, value: "a b" });
    expect(
      text('<p style={{whiteSpace:"pre-wrap"}}>a  b</p>')?.editable,
    ).toBe(false);
    expect(write("<pre>hello</pre>", "bye")).toBe('<pre>{"bye"}</pre>');
  });
  it("lets an emptied element take text again", () => {
    expect(text("<p></p>")).toEqual({ editable: true, value: "" });
    expect(write("<p></p>", "Hi")).toBe('<p>{"Hi"}</p>');
    const cleared = write("<p>Hello</p>", "")!;
    expect(cleared).toBe("<p></p>");
    const multi = write("<p>\n  Hello\n</p>", "")!;
    expect(text(multi)).toEqual({ editable: true, value: "" });
    expect(write(multi, "Hi")).toBe('<p>\n  {"Hi"}\n</p>');
  });
  it("hides text for elements that hold none", () => {
    for (const source of [
      "<p/>",
      "<div><p>a</p></div>",
      "<div>\n  <i>x</i>\n</div>",
      "<section>{\" \"}<b>x</b></section>",
      "<ul>\n  <li>a</li>\n</ul>",
    ])
      expect(text(source)).toEqual({ editable: false, value: null });
  });
  it("never offers an empty Text field on replaced, foreign or structural elements", () => {
    for (const source of [
      "<div></div>",
      "<ul></ul>",
      "<select></select>",
      "<tr></tr>",
      "<svg></svg>",
      "<canvas></canvas>",
      "<video></video>",
      "<iframe></iframe>",
    ])
      expect(text(source)?.editable, source).toBe(
        source === "<div></div>",
      );
    const svg = "<svg><path></path><text></text></svg>";
    const at = (open: string, close: string) =>
      locateJsx(svg, {
        file: "App.tsx",
        start: svg.indexOf(open),
        end: svg.indexOf(close) + close.length,
      })?.inspect().text;
    expect(at("<path>", "</path>")).toEqual({ editable: false, value: null });
    expect(at("<text>", "</text>")).toEqual({ editable: true, value: "" });
  });
  it.each([
    [
      '<h2>FEATURED <span className="accent">BIKES.</span></h2>',
      '<h2>{" "}<span className="accent">BIKES.</span></h2>',
      '<h2>{"NEW "}<span className="accent">BIKES.</span></h2>',
    ],
    [
      "<h2>\n    READY TO <span>RIDE?</span>\n  </h2>",
      '<h2>\n    {" "}<span>RIDE?</span>\n  </h2>',
      '<h2>\n    {"NEW "}<span>RIDE?</span>\n  </h2>',
    ],
    [
      "<h2>\n  CHASE THE<br/>\n  <span>FREEDOM.</span>\n</h2>",
      "<h2>\n  <br/>\n  <span>FREEDOM.</span>\n</h2>",
      '<h2>\n  {"NEW"}<br/>\n  <span>FREEDOM.</span>\n</h2>',
    ],
    [
      "<a>VELO<span>X</span></a>",
      "<a><span>X</span></a>",
      '<a>{"NEW"}<span>X</span></a>',
    ],
    [
      "<button><svg/> Go</button>",
      '<button><svg/>{" "}</button>',
      '<button><svg/>{" NEW"}</button>',
    ],
  ])("a cleared run next to an element takes text again: %j", (source, cleared, typed) => {
    expect(write(source, "")).toBe(cleared);
    expect(text(cleared)).toEqual({ editable: true, value: "" });
    expect(write(cleared, "NEW")).toBe(typed);
    expect(text(typed)).toEqual({ editable: true, value: "NEW" });
    // The result is valid JSX with no stray whitespace expression left.
    expect(typed).not.toContain('{" "}');
    expect(() =>
      packages.parser.parse(typed, { plugins: ["jsx"] }),
    ).not.toThrow();
    // An untouched blur on the cleared field changes nothing.
    expect(write(cleared, "")).toBe(cleared);
  });
});
describe("JSX: several text runs in one element", () => {
  const whole = (source: string) =>
    locateJsx(source, { file: "App.tsx", start: 0, end: source.length });
  const text = (source: string) => whole(source)?.inspect().text;
  const write = (source: string, value: string, index?: number) => {
    const patch = whole(source)?.patch({ field: "text", value, index });
    return patch ? spliceAt(source, patch) : null;
  };
  const hero = '<h1>RIDE<br/>BEYOND<br/><span className="accent">LIMITS.</span></h1>';
  it("reports every run and edits only the chosen one", () => {
    expect(text(hero)).toEqual({ editable: true, value: "RIDE", runs: ["RIDE", "BEYOND"] });
    const next = write(hero, "FURTHER", 1)!;
    expect(next).toBe('<h1>RIDE<br/>{"FURTHER"}<br/><span className="accent">LIMITS.</span></h1>');
    expect(text(next)).toEqual({ editable: true, value: "RIDE", runs: ["RIDE", "FURTHER"] });
    expect(() => packages.parser.parse(next, { plugins: ["jsx"] })).not.toThrow();
    const pasted = "<h1>\n  RIDE<br/>\n  BEYOND<br/>\n  <span>LIMITS.</span>\n</h1>";
    expect(text(pasted)).toEqual({ editable: true, value: "RIDE", runs: ["RIDE", "BEYOND"] });
    expect(write(pasted, "FURTHER", 1)).toBe(
      '<h1>\n  RIDE<br/>\n  {"FURTHER"}<br/>\n  <span>LIMITS.</span>\n</h1>',
    );
    expect(write('<p>{"a"}<br/>{"b"}</p>', "c", 1)).toBe('<p>{"a"}<br/>{"c"}</p>');
  });
  it("keeps one run as one field and rejects an index that does not exist", () => {
    const chase = "<h2>CHASE THE<br/><span>FREEDOM.</span></h2>";
    expect(text(chase)).toEqual({ editable: true, value: "CHASE THE" });
    expect(write(chase, "x", 1)).toBeNull();
    for (const index of [2, -1, 0.5, 8]) expect(write(hero, "x", index), String(index)).toBeNull();
  });
  it("edits up to eight runs; more are read-only", () => {
    const lines = (n: number) => `<p>${Array.from({ length: n }, (_, i) => `L${i + 1}`).join("<br/>")}</p>`;
    expect(text(lines(8))?.runs).toHaveLength(8);
    expect(text(lines(9))).toEqual({ editable: false, value: "L1 …" });
  });
});
describe("JSX: text tags holding only elements", () => {
  const whole = (source: string) =>
    locateJsx(source, { file: "App.tsx", start: 0, end: source.length });
  const text = (source: string) => whole(source)?.inspect().text;
  const write = (source: string, value: string) => {
    const patch = whole(source)?.patch({ field: "text", value });
    return patch ? spliceAt(source, patch) : null;
  };
  it.each([
    ["<li><a>Home</a></li>", '<li>{"NEW"}<a>Home</a></li>'],
    ['<a><img src="x"/></a>', '<a>{"NEW"}<img src="x"/></a>'],
  ])("shows an empty Text field and types before the child: %j", (source, typed) => {
    expect(text(source)).toEqual({ editable: true, value: "" });
    expect(write(source, "NEW")).toBe(typed);
    expect(() => packages.parser.parse(typed, { plugins: ["jsx"] })).not.toThrow();
    expect(text(typed)).toEqual({ editable: true, value: "NEW" });
  });
  it("never offers one on audio", () => {
    for (const source of ["<audio></audio>", '<audio><source src="a.mp3"/></audio>'])
      expect(text(source), source).toEqual({ editable: false, value: null });
  });
});

describe("empty JSX run separators", () => {
  it.each([
    ["<p>First<b>x</b> Second</p>", 1, '<p>First<b>x</b>{" NEW"}</p>'],
    ["<p>First <b>x</b>Second</p>", 0, '<p>{"NEW "}<b>x</b>Second</p>'],
    ["<p>First<b>x</b> Second <i>y</i></p>", 1, '<p>First<b>x</b>{" NEW "}<i>y</i></p>'],
  ] as const)("retains whitespace on its original side: %s", (source, index, expected) => {
    const whole = (source: string) => locateJsx(source, { file: "App.tsx", start: 0, end: source.length });
    const clear = whole(source)!.patch({ field: "text", value: "", index })!;
    const empty = spliceAt(source, clear);
    const patch = whole(empty)!.patch({ field: "text", value: "NEW", index })!;
    expect(spliceAt(empty, patch)).toBe(expected);
    expect(() => packages.parser.parse(empty, { plugins: ["jsx"] })).not.toThrow();
  });
});
