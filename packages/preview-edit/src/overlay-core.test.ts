// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { COMPUTED_KEYS, describeElement, elementAt, isPickable, pathTo, readComputed } from "./overlay-core";

function page(html: string): Element {
  document.body.innerHTML = html;
  return document.body;
}

describe("isPickable", () => {
  it("accepts content elements and rejects the document shell, scripts and styles", () => {
    page("<main><h1>Hi</h1><script></script><style></style></main>");
    expect(isPickable(document.querySelector("h1")!)).toBe(true);
    expect(isPickable(document.body)).toBe(false);
    expect(isPickable(document.documentElement)).toBe(false);
    expect(isPickable(document.querySelector("script")!)).toBe(false);
    expect(isPickable(document.querySelector("style")!)).toBe(false);
  });
});

describe("readComputed", () => {
  it("returns every key as a short string", () => {
    page('<p style="color: rgb(1, 2, 3); font-size: 20px; padding: 4px 8px 4px 8px">x</p>');
    const computed = readComputed(document.querySelector("p")!, window);
    expect(Object.keys(computed).sort()).toEqual([...COMPUTED_KEYS].sort());
    expect(computed.color).toBe("rgb(1, 2, 3)");
    expect(computed.fontSize).toBe("20px");
    // The panel only accepts short values (the shorthand padding is cut to its first value).
    expect(computed.padding.length).toBeLessThanOrEqual(12);
    expect(computed.padding).toBe("4px");
  });
});

describe("describeElement", () => {
  it("returns tag, text, bounded html and computed styles", () => {
    page(`<p class="a">${"x".repeat(2000)}</p>`);
    const info = describeElement(document.querySelector("p")!, window);
    expect(info.tag).toBe("p");
    expect(info.text.length).toBeLessThanOrEqual(200);
    expect(info.html.length).toBeLessThanOrEqual(600);
    expect(info.html.startsWith('<p class="a">')).toBe(true);
  });
});

describe("pathTo / elementAt", () => {
  it("round trips through element indexes", () => {
    const root = page("<main><div></div><div><span></span><b id='t'></b></div></main>");
    const target = document.getElementById("t")!;
    const path = pathTo(target, root);
    expect(path).toEqual([0, 1, 1]);
    expect(elementAt(root, path)).toBe(target);
    expect(elementAt(root, [0, 9])).toBeNull();
  });
});
