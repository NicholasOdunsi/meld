import { describe, expect, it } from "vitest";
import { buildPastedSource, NO_EXPORT_MESSAGE, normalizeReact, stylesheetNotice, TOO_LARGE_MESSAGE } from "./paste-source";

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
  it("strips linked stylesheets from HTML and reports them", () => {
    expect(buildPastedSource('<head><link href="https://fonts.googleapis.com/css2?family=DM+Sans" rel="stylesheet"></head><body><h1>Hi</h1></body>', "html")).toEqual({
      ok: true, removedStylesheets: ["https://fonts.googleapis.com/css2?family=DM+Sans"],
      source: { kind: "html", files: { "index.html": "<head></head><body><h1>Hi</h1></body>" }, entry: "index.html" },
    });
  });
  it("names the stylesheet hosts in the notice", () => {
    expect(stylesheetNotice(["https://fonts.googleapis.com/css2?family=DM+Sans"])).toBe("Removed a linked stylesheet (fonts.googleapis.com). Screens can't load outside styles, so fonts and styles from it won't show.");
    expect(stylesheetNotice(["a.css", "b.css"])).toBe("Removed 2 linked stylesheets (a.css, b.css). Screens can't load outside styles, so fonts and styles from them won't show.");
  });
  it("explains a missing export and an oversized paste", () => {
    expect(buildPastedSource("const Card = () => <main/>;", "react")).toEqual({ ok: false, message: NO_EXPORT_MESSAGE });
    expect(buildPastedSource(`<p>${"x".repeat(262_144)}</p>`, "html")).toEqual({ ok: false, message: TOO_LARGE_MESSAGE });
  });
});


describe("normalization syntax context", () => {
  it.each([
    "const Card = () => <main />; export { Card as default };",
    "const Card = () => <main />; export { Card as App };",
  ])("keeps mountable exported aliases: %s", (code) => {
    expect(normalizeReact(code)).toBe(code);
  });
  it.each([
    "const App = () => <main />; export { App as Card };",
    "const App: React.FC = () => <main />;",
    "  const App: React.FC = () => <main />;",
    "/* export default Card; */ const App = () => <main />;",
    'const example = "export default Card"; const App = () => <main />;',
  ])("exports the available top-level App: %s", (code) => {
    expect(normalizeReact(code)).toBe(`${code.trim()}\n\nexport default App;\n`);
  });
  it.each([
    "const example = /export default Card/; const Card = () => <main />;",
    "const Card = function App() { return <main />; };",
    "{\nfunction App() { return <main />; }\n}",
    "function outer() {\nconst App = () => <main />;\n}",
    "// export default Card;\nconst Card = () => <main />;",
    'const example = "export default Card"; const Card = () => <main />;',
  ])("rejects unavailable mounts: %s", (code) => {
    expect(normalizeReact(code)).toBeNull();
  });
  it.each(["<main>export default Card</main>", "<main>{/* export default Card */}Hi</main>"])("wraps JSX text: %s", (code) => {
    expect(normalizeReact(code)).toContain(`<>\n${code}\n    </>`);
  });
});


describe("generic TSX helpers", () => {
  it.each(["<T,>", "<T, U>"])("preserves the export after %s", (parameters) => {
    const code = `const identity = ${parameters}(value: T) => value;\nexport default function Card() { return <main />; }`;
    expect(normalizeReact(code)).toBe(code);
  });
});
