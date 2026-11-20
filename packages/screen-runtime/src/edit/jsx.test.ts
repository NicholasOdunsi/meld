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
