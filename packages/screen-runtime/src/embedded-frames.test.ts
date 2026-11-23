import { transform } from "@babel/standalone";
import { describe, expect, it } from "vitest";
import { EMBEDDED_FRAME_TAGS, embeddedFrameMessage, embeddedFramesPlugin } from "./embedded-frames";

function found(code: string) {
  const tags = new Set<string>();
  transform(code, { plugins: ["syntax-jsx", embeddedFramesPlugin(tags)] });
  return [...tags].sort();
}

describe("embeddedFramesPlugin", () => {
  it("records host frame elements", () => {
    expect(found('const a = <main><iframe srcDoc="x" /><object data="y" /><embed /></main>;')).toEqual(["embed", "iframe", "object"]);
  });
  it("ignores components and other host elements", () => {
    expect(found("const a = <Iframe><section /></Iframe>;")).toEqual([]);
  });
  it("names the tag in the message", () => {
    expect(embeddedFrameMessage("iframe")).toBe("Embedded frames are not supported: <iframe>");
    expect([...EMBEDDED_FRAME_TAGS].sort()).toEqual(["embed", "frame", "frameset", "iframe", "object"]);
  });
});
