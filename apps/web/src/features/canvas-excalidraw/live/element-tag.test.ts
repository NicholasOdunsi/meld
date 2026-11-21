import { describe, expect, it } from "vitest";
import { parseElementTag, remapTag } from "./element-tag";

it("reads file, start and end, including paths with colons", () => {
  expect(parseElementTag("src/a.tsx:10:50")).toEqual({ file: "src/a.tsx", start: 10, end: 50 });
  expect(parseElementTag("C:/a.tsx:1:2")).toEqual({ file: "C:/a.tsx", start: 1, end: 2 });
});
it("rejects anything else", () => {
  for (const bad of ["", "nonsense", "a.tsx:1", "a.tsx:x:2", "a.tsx:5:2", ":1:2", "a.tsx:1:2:", `a.tsx:${"9".repeat(20)}:${"9".repeat(21)}`]) expect(parseElementTag(bad)).toBeNull();
});

describe("remapTag", () => {
  // '<main><b>Hi</b></main>': the b element is 6..15.
  const old = { "a.html": "<main><b>Hi</b></main>" };
  const tag = "a.html:6:15";
  const to = (text: string) => remapTag(old, { "a.html": text }, tag);
  it("keeps the tag when the file is identical", () => expect(to("<main><b>Hi</b></main>")).toBe(tag));
  it("keeps the tag when the change is after the element", () => {
    expect(to("<main><b>Hi</b><i>x</i></main>")).toBe(tag);
    expect(to("<main><b>Hi</b></section>")).toBe(tag);
    expect(to("<main><b>Hi</b></main><footer></footer>")).toBe(tag);
  });
  it("moves the tag by the change in length when the change is before the element", () => {
    expect(to("<mainx><b>Hi</b></main>")).toBe("a.html:7:16");
    expect(to("<main id=x><b>Hi</b></main>")).toBe("a.html:11:20");
    // Text that repeats its neighbours (the new "<p>" ends in the "<" that starts "<b>") is still before.
    expect(to("<main><p>New</p><b>Hi</b></main>")).toBe("a.html:16:25");
    expect(remapTag({ "a.html": "<p>New</p><b>Hi</b>" }, { "a.html": "<b>Hi</b>" }, "a.html:10:19")).toBe("a.html:0:9");
  });
  it("moves only the end when the change is inside the element", () => {
    expect(to("<main><b>Hello</b></main>")).toBe("a.html:6:18");
    expect(to('<main><b style="color:red">Hi</b></main>')).toBe("a.html:6:33");
    expect(to("<main><b>H</b></main>")).toBe("a.html:6:14");
    expect(remapTag({ "a.html": '<b style="color:#abcdef">Hi</b>' }, { "a.html": "<b>Hi</b>" }, "a.html:0:31")).toBe("a.html:0:9");
  });
  it("cannot place a change that crosses an edge of the element", () => {
    expect(to("<section><b>Hi</b></section>")).toBeNull();
    // Nothing of the element survives.
    expect(to("<main>X</main>")).toBeNull();
    expect(to("<mainb>Hi</main>")).toBeNull();
    expect(to("<main><b>Hi</main>")).toBeNull();
  });
  it("cannot place an insertion exactly where the element starts, but places one at its end", () => {
    expect(to("<main>NEW<b>Hi</b></main>")).toBeNull();
    expect(to("<main><b>Hi</b>NEW</main>")).toBe(tag);
  });
  it("is null when the element is gone, or the file is", () => {
    expect(to("<main></main>")).toBeNull();
    expect(remapTag(old, { "b.html": "x" }, tag)).toBeNull();
    expect(remapTag(old, old, "nonsense")).toBeNull();
    expect(remapTag(old, old, "other.html:0:3")).toBeNull();
  });
  it("grows an element that is the whole file", () => {
    expect(remapTag({ "a.html": "<b>x</b>" }, { "a.html": "<b>xx</b>" }, "a.html:0:8")).toBe("a.html:0:9");
  });
});
