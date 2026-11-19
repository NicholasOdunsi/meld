import { describe, expect, it } from "vitest";
import { MAX_SCREEN_LINKS } from "./constants";
import { extractLinks } from "./links";

describe("extractLinks", () => {
  it("collects, deduplicates, and sorts links across source files", () => {
    expect(extractLinks({
      "App.tsx": `orion.goto("settings"); orion.goto( 'profile' ); orion.goto(\n"stats"\n);`,
      "index.html": `<button data-goto="home"></button><a data-goto='profile'></a>`,
    })).toEqual(["home", "profile", "settings", "stats"]);
  });

  it("ignores invalid keys, dynamic expressions, and mismatched quotes", () => {
    expect(extractLinks({
      "App.tsx": `
        orion.goto("Bad Key"); orion.goto(screen); orion.goto(\`home\`);
        orion.goto("home" + suffix); orion.goto("home');
        data-goto="profile' data-goto={screen} data-goto=""
        data-goto="Upper" data-goto="9start" data-goto="${"a".repeat(65)}"
      `,
    })).toEqual([]);
  });

  it("accepts screen keys at the validation boundaries", () => {
    const longest = `a${"b".repeat(63)}`;
    expect(extractLinks({
      "App.tsx": `orion.goto("${longest}"); orion.goto('a'); data-goto="screen_2-end"`,
    })).toEqual(["a", longest, "screen_2-end"]);
  });

  it("caps links after sorting all unique keys", () => {
    const keys = Array.from({ length: MAX_SCREEN_LINKS + 5 }, (_, i) => `screen_${String(i).padStart(3, "0")}`);
    expect(extractLinks({
      "App.tsx": [...keys].reverse().map((key) => `orion.goto("${key}")`).join(";"),
      "index.html": `data-goto="${keys[0]}"`,
    })).toEqual(keys.slice(0, MAX_SCREEN_LINKS));
  });

  it("does not leak regular-expression state between files or calls", () => {
    const files = { "a.ts": `orion.goto("home")`, "b.html": `data-goto='profile'` };
    expect(extractLinks(files)).toEqual(["home", "profile"]);
    expect(extractLinks(files)).toEqual(["home", "profile"]);
    expect(extractLinks({})).toEqual([]);
    expect(extractLinks({ "a.html": `data-goto="stats"` })).toEqual(["stats"]);
  });
});
