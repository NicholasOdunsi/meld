import { packages } from "@babel/standalone";
import { describe, expect, it } from "vitest";
import { jsxTextValue } from "./jsx";
import { collapse, edges, isBlank, textBinding, type Content } from "./runs";

// The string Babel's own JSX transform makes of a text child.
function babelText(text: string): string | null {
  const ast = packages.parser.parse(`<p>${text}</p>`, { plugins: ["jsx"] });
  let value: string | null = null;
  packages.traverse.default(ast, {
    JSXText(path) {
      value = packages.types.react.buildChildren(
        packages.types.jsxElement(
          packages.types.jsxOpeningElement(packages.types.jsxIdentifier("p"), []),
          packages.types.jsxClosingElement(packages.types.jsxIdentifier("p")),
          [path.node],
        ),
      ).map((child) => (child.type === "StringLiteral" ? child.value : ""))[0] ?? "";
      path.stop();
    },
  });
  return value;
}

describe("text runs", () => {
  it("collapses only HTML whitespace", () => {
    expect(collapse("\n  a \t b\r\n ")).toBe("a b");
    expect(collapse("\u00a0a\u00a0")).toBe("\u00a0a\u00a0");
    expect(isBlank(" \n\t")).toBe(true);
    expect(isBlank("\u00a0")).toBe(false);
    expect(edges("\n  hi  ")).toEqual({ lead: "\n  ", trail: "  " });
    expect(edges("   ")).toEqual({ lead: "   ", trail: "" });
  });
  it.each([
    "FEATURED ",
    "\n  CHASE THE",
    "\n    READY TO ",
    "  a\n   b  \n\n  c ",
    "\tx\ty\t",
    "one\r\ntwo",
    "\n   \n",
  ])("reads a JSX text child the way Babel does: %j", (text) => {
    expect(jsxTextValue(text)).toBe(babelText(text));
  });
  it("binds several runs, and is read-only for more than eight or computed children", () => {
    const run = (text: string) => ({ from: 0, to: 0, text, write: (v: string) => v });
    const content = (over: Partial<Content>): Content => ({
      runs: [],
      dynamic: 0,
      elements: 0,
      insert: null,
      preserve: false,
      textTag: false,
      ...over,
    });
    const two = textBinding(content({ runs: [run("a"), run(" "), run("b")] }))!;
    expect(two).toMatchObject({ value: "a", runs: ["a", "b"] });
    expect(two.make!("x", 1)).toEqual({ from: 0, to: 0, value: "x" });
    expect(two.make!("x", 2)).toBeNull();
    const nine = Array.from({ length: 9 }, (_, i) => run(String(i)));
    expect(textBinding(content({ runs: nine }))).toMatchObject({ value: "0 …", make: null });
    expect(textBinding(content({ runs: nine.slice(1) }))?.runs).toHaveLength(8);
    expect(textBinding(content({ runs: [run("a")] }))).not.toHaveProperty("runs");
    expect(textBinding(content({ dynamic: 1 }))).toMatchObject({ value: "…", make: null });
    expect(textBinding(content({ elements: 2, runs: [run(" ")] }))).toBeNull();
    expect(textBinding(content({}))).toBeNull();
    // Only blank text next to elements: a text tag still takes typing, a layout container does not.
    const insert = (value: string) => ({ from: 0, to: 0, value });
    expect(textBinding(content({ elements: 1, runs: [run(" ")], insert }))).toBeNull();
    expect(
      textBinding(content({ elements: 1, runs: [run(" ")], insert, textTag: true })),
    ).toMatchObject({ value: "" });
  });
});
