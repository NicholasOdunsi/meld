import { describe, expect, it } from "vitest";
import { applyTweak, inspectElement } from "@meld/screen-runtime/edit";
import { shiftTag } from "./element-session";
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

describe("remapTag after a text-run edit (text next to a span)", () => {
  const page = '<section>\n  <h2>FEATURED <span class="accent">BIKES.</span></h2>\n  <p>x</p>\n</section>';
  const files = { "index.html": page };
  const range = (text: string, open: string, close: string) => {
    const start = text.indexOf(open);
    return `index.html:${start}:${text.indexOf(close, start) + close.length}`;
  };
  const h2 = range(page, "<h2>", "</h2>");
  const span = range(page, "<span", "</span>");
  it.each([
    ["replace", "NEW", "NEW"],
    ["grow", "FEATURED FEATURED", "FEATURED FEATURED"],
    // Cleared, the h2 keeps an empty, editable Text field (see the next test).
    ["empty", "", ""],
    ["no-op", "FEATURED", "FEATURED"],
  ])("%s: the h2 follows the edit and its undo, and the span after the run stays pickable", (_name, typed, shown) => {
    const result = applyTweak(files, h2, { field: "text", value: typed });
    if (!result.ok) throw new Error(result.reason);
    const after = result.files["index.html"];
    const movedH2 = range(after, "<h2>", "</h2>");
    // The hand-edit panel's shift (the edit is inside the element) and the history's remap agree with the file.
    expect(shiftTag(h2, after.length - page.length)).toBe(movedH2);
    expect(remapTag(files, result.files, h2)).toBe(movedH2);
    expect(inspectElement(result.files, movedH2)?.text.value ?? null).toBe(shown);
    // Undo puts the tag back where it was.
    expect(remapTag(result.files, files, movedH2)).toBe(h2);
    // The span after the edited run moves with it and can still be edited on its own.
    const movedSpan = remapTag(files, result.files, span);
    expect(movedSpan).toBe(range(after, "<span", "</span>"));
    expect(inspectElement(result.files, movedSpan!)?.text).toEqual({ editable: true, value: "BIKES." });
    const spanEdit = applyTweak(result.files, movedSpan!, { field: "text", value: "RIDES." });
    expect(spanEdit.ok && spanEdit.files["index.html"]).toContain('<span class="accent">RIDES.</span></h2>');
  });
});

it("clearing the run next to the span keeps the h2 editable: typing again needs no Undo, and the span follows", () => {
  const page = '<section>\n  <h2>FEATURED <span class="accent">BIKES.</span></h2>\n</section>';
  const files = { "index.html": page };
  const range = (text: string, open: string, close: string) => {
    const start = text.indexOf(open);
    return `index.html:${start}:${text.indexOf(close, start) + close.length}`;
  };
  const h2 = range(page, "<h2>", "</h2>");
  const span = range(page, "<span", "</span>");
  const cleared = applyTweak(files, h2, { field: "text", value: "" });
  if (!cleared.ok) throw new Error(cleared.reason);
  const clearedH2 = shiftTag(h2, cleared.files["index.html"].length - page.length);
  expect(clearedH2).toBe(range(cleared.files["index.html"], "<h2>", "</h2>"));
  expect(inspectElement(cleared.files, clearedH2)?.text).toEqual({ editable: true, value: "" });

  const typed = applyTweak(cleared.files, clearedH2, { field: "text", value: "NEW" });
  if (!typed.ok) throw new Error(typed.reason);
  const after = typed.files["index.html"];
  expect(after).toContain('<h2>NEW <span class="accent">BIKES.</span></h2>');
  const typedH2 = shiftTag(clearedH2, after.length - cleared.files["index.html"].length);
  expect(typedH2).toBe(range(after, "<h2>", "</h2>"));
  expect(remapTag(cleared.files, typed.files, clearedH2)).toBe(typedH2);
  expect(inspectElement(typed.files, typedH2)?.text).toEqual({ editable: true, value: "NEW" });
  // The span moved twice and is still its own element; undoing both steps puts every tag back.
  const spanNow = remapTag(cleared.files, typed.files, remapTag(files, cleared.files, span)!);
  expect(spanNow).toBe(range(after, "<span", "</span>"));
  expect(remapTag(typed.files, cleared.files, typedH2)).toBe(clearedH2);
  expect(remapTag(cleared.files, files, clearedH2)).toBe(h2);
});
