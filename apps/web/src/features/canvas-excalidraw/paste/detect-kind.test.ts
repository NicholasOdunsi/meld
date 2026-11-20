import { describe, expect, it } from "vitest";
import { detectScreenKind, EMPTY_PASTE_MESSAGE, NOT_CODE_MESSAGE } from "./detect-kind";

describe("detectScreenKind", () => {
  it.each([
    ['import { useState } from "react";\nexport default function App() { return <main/>; }', "react"],
    ["export default () => <main>Hi</main>", "react"],
    ['<div className="p-4">Hi</div>', "react"],
    ["<>\n  <h1>Hi</h1>\n</>", "react"],
    ['<button onClick={() => go()}>Go</button>', "react"],
    ["function App() {\n  return (<main>Hi</main>);\n}", "react"],
    ["const App = () => <main>Hi</main>;", "react"],
    ["<!doctype html><html><body><h1>Hi</h1></body></html>", "html"],
    ["<main><h1>Hi</h1></main>", "html"],
    ['<button onclick="x={a:1}">Go</button>', "html"],
    ['<button onclick="const x = {a:1}; go(x)">Go</button>', "html"],
    ['<button title="example className=demo and attr={value}">Go</button>', "html"],
    ["<button title='example attr={value}'>Go</button>", "html"],
    ['<button title="example" onClick={() => go("hi")}>Go</button>', "react"],
    ["  <script>document.body.append('x')</script>", "html"],
  ])("detects %s", (code, kind) => {
    expect(detectScreenKind(code)).toEqual({ ok: true, kind });
  });

  it("explains empty and non-code pastes", () => {
    expect(detectScreenKind("   ")).toEqual({ ok: false, message: EMPTY_PASTE_MESSAGE });
    expect(detectScreenKind("make me a login page")).toEqual({ ok: false, message: NOT_CODE_MESSAGE });
    expect(detectScreenKind("body { color: red }")).toEqual({ ok: false, message: NOT_CODE_MESSAGE });
  });
});
