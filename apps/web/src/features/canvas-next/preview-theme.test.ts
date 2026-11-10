import { expect, it } from "vitest";
import { previewTheme } from "./preview-theme";
it("copies only the known theme properties into the isolated body", () => {
  const css = previewTheme({getPropertyValue: name => name === "--color-accent" ? " Highlight " : "initial"});
  expect(css).toContain("body {");
  expect(css).toContain("--color-accent: Highlight;");
  expect(css).not.toContain(":root");
});
