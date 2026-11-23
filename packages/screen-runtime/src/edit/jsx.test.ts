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
  it("rejects computed, nested and mixed text", () => {
    for (const text of ["{name}", "<i>x</i>", 'hi {"x"}'])
      expect(locate("<b>" + text + "</b>")?.inspect().text.editable).toBe(
        false,
      );
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
  it("shows computed or several runs read-only with their static text", () => {
    expect(text("<p>Hi {name}</p>")).toEqual({
      editable: false,
      value: "Hi …",
    });
    expect(text("<p>{name}</p>")).toEqual({ editable: false, value: "…" });
    expect(text("<p>{`Hi`}</p>")).toEqual({ editable: false, value: "…" });
    expect(text("<h1>RIDE<br/>BEYOND<br/><span>x</span></h1>")).toEqual({
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
    for (const source of ["<p/>", "<div><p>a</p></div>", "<h2><span>X</span></h2>"])
      expect(text(source)).toEqual({ editable: false, value: null });
  });
});
