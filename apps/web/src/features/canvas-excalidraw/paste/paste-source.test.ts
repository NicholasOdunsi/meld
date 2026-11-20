import { describe, expect, it } from "vitest";
import { buildPastedSource, NO_EXPORT_MESSAGE, normalizeReact, TOO_LARGE_MESSAGE } from "./paste-source";

describe("normalizeReact", () => {
  it("keeps code that already exports a component", () => {
    for (const code of ["export default function App() { return null; }", "export function App() { return null; }", "function App() { return null; }\nexport { App };"]) {
      expect(normalizeReact(code)).toBe(code);
    }
  });
  it("wraps a bare JSX snippet in a default App component", () => {
    expect(normalizeReact('<div className="p-4">Hi</div>')).toBe('export default function App() {\n  return (\n    <>\n<div className="p-4">Hi</div>\n    </>\n  );\n}\n');
  });
  it("exports a declared App component", () => {
    expect(normalizeReact("function App() { return <main/>; }")).toBe("function App() { return <main/>; }\n\nexport default App;\n");
    expect(normalizeReact("const App = () => <main/>;")).toBe("const App = () => <main/>;\n\nexport default App;\n");
  });
  it("gives up when there is no component to mount", () => {
    expect(normalizeReact("const Card = () => <main/>;")).toBeNull();
  });
});

describe("buildPastedSource", () => {
  it("builds a one-file React source", () => {
    expect(buildPastedSource("export default () => <main/>", "react")).toEqual({
      ok: true, source: { kind: "react", files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" },
    });
  });
  it("builds a one-file HTML source", () => {
    expect(buildPastedSource("  <h1>Hi</h1>\n", "html")).toEqual({
      ok: true, source: { kind: "html", files: { "index.html": "<h1>Hi</h1>" }, entry: "index.html" },
    });
  });
  it("explains a missing export and an oversized paste", () => {
    expect(buildPastedSource("const Card = () => <main/>;", "react")).toEqual({ ok: false, message: NO_EXPORT_MESSAGE });
    expect(buildPastedSource(`<p>${"x".repeat(262_144)}</p>`, "html")).toEqual({ ok: false, message: TOO_LARGE_MESSAGE });
  });
});
