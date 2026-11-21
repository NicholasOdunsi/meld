import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  codeColours,
  codeExtensions,
  contrastRatio,
  isDarkBackground,
} from "./code-theme";

describe("code theme", () => {
  it.each(["dark", "light"] as const)(
    "%s palette keeps every syntax colour readable",
    (mode) => {
      const p = codeColours[mode];
      for (const key of [
        "fg",
        "keyword",
        "string",
        "number",
        "comment",
        "tag",
        "attribute",
        "fn",
        "type",
        "property",
      ] as const)
        expect(contrastRatio(p[key], p.bg), key).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.gutter, p.bg)).toBeGreaterThanOrEqual(3);
    },
  );
  it("tells dark from light backgrounds", () => {
    expect(isDarkBackground("rgb(23, 23, 23)")).toBe(true);
    expect(isDarkBackground("rgb(255, 255, 255)")).toBe(false);
    expect(isDarkBackground("rgba(250, 250, 250, 1)")).toBe(false);
  });
  it("treats a transparent background as unknown (default dark), not as black-on-light", () => {
    expect(isDarkBackground("rgba(0, 0, 0, 0)")).toBe(true);
    expect(isDarkBackground("rgba(255, 255, 255, 0)")).toBe(true);
  });
  it("builds editor extensions for both modes", () => {
    for (const dark of [true, false])
      expect(() =>
        EditorState.create({ doc: "x", extensions: codeExtensions(dark) }),
      ).not.toThrow();
  });
});
