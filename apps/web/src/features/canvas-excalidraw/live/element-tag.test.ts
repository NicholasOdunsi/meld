import { expect, it } from "vitest";
import { parseElementTag } from "./element-tag";

it("reads file, start and end, including paths with colons", () => {
  expect(parseElementTag("src/a.tsx:10:50")).toEqual({ file: "src/a.tsx", start: 10, end: 50 });
  expect(parseElementTag("C:/a.tsx:1:2")).toEqual({ file: "C:/a.tsx", start: 1, end: 2 });
});
it("rejects anything else", () => {
  for (const bad of ["", "nonsense", "a.tsx:1", "a.tsx:x:2", "a.tsx:5:2", ":1:2", "a.tsx:1:2:", `a.tsx:${"9".repeat(20)}:${"9".repeat(21)}`]) expect(parseElementTag(bad)).toBeNull();
});
