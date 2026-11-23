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
  it("is read-only with a reason for several runs or computed children", () => {
    const run = (text: string) => ({ from: 0, to: 0, text, write: (v: string) => v });
    const content = (over: Partial<Content>): Content => ({
      runs: [],
      dynamic: 0,
      elements: 0,
      insert: null,
      preserve: false,
      ...over,
    });
    expect(textBinding(content({ runs: [run("a"), run("b")] }))).toMatchObject({ value: "a …", make: null });
    expect(textBinding(content({ dynamic: 1 }))).toMatchObject({ value: "…", make: null });
    expect(textBinding(content({ elements: 2, runs: [run(" ")] }))).toBeNull();
    expect(textBinding(content({}))).toBeNull();
  });
});
