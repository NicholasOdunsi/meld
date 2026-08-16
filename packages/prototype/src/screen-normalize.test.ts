import { describe, expect, it } from "vitest";
import { stripCdataWrapper } from "./screen-normalize";

describe("stripCdataWrapper", () => {
  it("removes a CDATA wrapper spanning the whole value", () => {
    expect(stripCdataWrapper('<![CDATA[<div class="app">hi</div>]]>')).toBe(
      '<div class="app">hi</div>',
    );
    expect(stripCdataWrapper("<![CDATA[.app{color:red}]]>")).toBe(
      ".app{color:red}",
    );
  });

  it("tolerates surrounding whitespace around the wrapper", () => {
    expect(stripCdataWrapper("  <![CDATA[.x{color:red}]]>\n")).toBe(
      ".x{color:red}",
    );
  });

  it("leaves unwrapped content unchanged", () => {
    const html = '<div class="app">hi</div>';
    expect(stripCdataWrapper(html)).toBe(html);
    expect(stripCdataWrapper("")).toBe("");
  });

  it("leaves inner CDATA (e.g. inside inline SVG) untouched", () => {
    const svg = '<svg><style><![CDATA[.a{fill:red}]]></style></svg>';
    expect(stripCdataWrapper(svg)).toBe(svg);
  });

  it("does not strip when multiple CDATA sections are concatenated", () => {
    const doubled = "<![CDATA[a]]><![CDATA[b]]>";
    expect(stripCdataWrapper(doubled)).toBe(doubled);
  });
});
