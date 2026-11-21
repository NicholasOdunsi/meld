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
  it("declines mixed and raw text", () => {
    for (const source of [
      "<b>x<i>y</i></b>",
      "<script>alert(1)</script>",
      "<textarea>x</textarea>",
      "<b>x<!--y--></b>",
    ])
      expect(node(source)?.inspect().text.editable).toBe(false);
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
