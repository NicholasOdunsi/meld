import { transform } from "@babel/standalone";
import { describe, expect, it } from "vitest";
import { TAG_ATTRIBUTE } from "./constants";
import { parseTag, tagElementsPlugin } from "./tag-elements";

function tag(source: string, presets: string[] = []) {
  return transform(source, {
    filename: "ui/App.tsx",
    parserOpts: { plugins: ["jsx", "typescript"] },
    plugins: [tagElementsPlugin("ui/App.tsx")],
    presets,
  }).code!;
}

describe("tagElementsPlugin", () => {
  it("tags only host elements with the original complete JSX source offsets", () => {
    const source = "export default function App(){return <main><Card/><h1>Hi</h1></main>}";
    const code = tag(source);
    const tags = [...code.matchAll(/data-orion-src="([^"]+)"/g)];
    expect(tags).toHaveLength(2);
    const main = parseTag(tags[0][1]);
    const heading = parseTag(tags[1][1]);
    expect(main).toEqual({ file: "ui/App.tsx", start: source.indexOf("<main>"), end: source.lastIndexOf("</main>") + 7 });
    expect(heading?.file).toBe("ui/App.tsx");
    expect(source.slice(heading!.start, heading!.end)).toBe("<h1>Hi</h1>");
    expect(code).toContain("<Card />");
  });

  it("tags hosts before React and TypeScript presets transform JSX", () => {
    const source = "const title: string = 'Hi'; const app = <h1>{title}</h1>;";
    const code = tag(source, ["react", "typescript"]);
    expect(code).toContain(`"${TAG_ATTRIBUTE}": "ui/App.tsx:${source.indexOf("<h1>")}:${source.indexOf("</h1>") + 5}"`);
  });

  it("skips capitalized and member components while tagging self-closing hosts", () => {
    const code = tag("const app = <><Card/><UI.Card/><ui.Card/><input/></>;");
    expect([...code.matchAll(/data-orion-src=/g)]).toHaveLength(1);
    expect(code).toMatch(/<input data-orion-src=/);
  });

  it("preserves existing tag attributes without duplicating them", () => {
    const code = tag('<main data-orion-src="existing:1:2"><input /></main>');
    expect([...code.matchAll(/data-orion-src=/g)]).toHaveLength(2);
    expect(code).toContain('data-orion-src="existing:1:2"');
  });
});

describe("parseTag", () => {
  it("parses folder filenames and source offsets", () => {
    expect(parseTag("ui/Button.tsx:10:20")).toEqual({ file: "ui/Button.tsx", start: 10, end: 20 });
    expect(parseTag("C:/ui/Button.tsx:0:0")).toEqual({ file: "C:/ui/Button.tsx", start: 0, end: 0 });
  });

  it.each([
    "nonsense", "", ":1:2", "ui/Button.tsx:20:10", "ui/Button.tsx:-1:2",
    "ui/Button.tsx:1.5:2", "ui/Button.tsx:1:Infinity", "ui/Button.tsx:1:2tail",
    "ui/Button.tsx:9007199254740992:9007199254740992", "ui/Button.tsx:1:9007199254740992",
    "ui/Button.tsx:1:2\n",
  ])("rejects malformed tags: %s", (value) => {
    expect(parseTag(value)).toBeNull();
  });
});
