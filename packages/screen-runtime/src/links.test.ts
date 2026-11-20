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

  it("reads HTML whitespace and entities and static JSX expression attributes", () => {
    expect(extractLinks({
      "index.html": `<button data-goto = "settings"></button><a data-goto='pr&#111;file'></a>`,
      "App.tsx": `const node = <><button data-goto={"settings"} /><Link data-goto={'home'} /><a data-goto="stats" /></>;`,
    })).toEqual(["home", "profile", "settings", "stats"]);
  });

  it("ignores invalid keys and dynamic expressions", () => {
    expect(extractLinks({
      "App.tsx": `
        orion.goto("Bad Key"); orion.goto(screen); orion.goto(\`home\`);
        orion.goto("home" + suffix); orion['goto']('profile');
        const nodes = <><a data-goto={screen} /><a data-goto={"home" + suffix} />
          <a data-goto="" /><a data-goto="Upper" /><a data-goto="9start" />
          <a data-goto="${"a".repeat(65)}" /></>;
      `,
    })).toEqual([]);
  });

  it("ignores comments, string text, JSX text, CSS, and unsupported files", () => {
    expect(extractLinks({
      "App.tsx": `
        // orion.goto('deleted_screen')
        /* orion.goto('comment') */
        const text = "orion.goto('string_text')";
        const attr = 'data-goto="string_attr"';
        const node = <p>orion.goto('jsx_text'){/* <a data-goto="jsx_comment" /> */}</p>;
      `,
      "index.html": `<!-- <a data-goto="comment_attr">orion.goto('comment_call')</a> -->
        <p>orion.goto('html_text')</p><style>body { content: "orion.goto('style_text')"; }</style>`,
      "styles.css": `a[data-goto="css_attr"] { content: "orion.goto('css_text')"; }`,
      "notes.txt": `orion.goto('notes'); data-goto="notes_attr"`,
    })).toEqual([]);
  });

  it("reads executable inline scripts and event handlers while ignoring inert scripts", () => {
    expect(extractLinks({
      "index.html": `
        <script>orion.goto('home'); const fake = "orion.goto('fake')";</script>
        <script type="module">orion.goto('profile')</script>
        <script type="text/javascript; charset=utf-8">orion.goto('stats')</script>
        <button onclick="if (ready) { orion.goto(&quot;settings&quot;); } return false;"></button>
        <script type="application/json">"orion.goto('json_text')"</script>
        <script type="text/plain">orion.goto('plain_text')</script>
        <script type="importmap">{"x":"orion.goto('importmap')"}</script>
        <script src="external.js">orion.goto('unused_inline')</script>
      `,
    })).toEqual(["home", "profile", "settings", "stats"]);
  });

  it.each(["js", "jsx", "ts", "tsx"])("reads real calls in .%s source", (extension) => {
    expect(extractLinks({ [`screen.${extension}`]: `orion.goto('home')` })).toEqual(["home"]);
  });

  it("accepts screen keys at the validation boundaries", () => {
    const longest = `a${"b".repeat(63)}`;
    expect(extractLinks({
      "App.tsx": `orion.goto("${longest}"); orion.goto('a'); const node = <a data-goto="screen_2-end" />;`,
    })).toEqual(["a", longest, "screen_2-end"]);
  });

  it("caps links after sorting all unique keys", () => {
    const keys = Array.from({ length: MAX_SCREEN_LINKS + 5 }, (_, i) => `screen_${String(i).padStart(3, "0")}`);
    expect(extractLinks({
      "App.tsx": [...keys].reverse().map((key) => `orion.goto("${key}")`).join(";"),
      "index.html": `<a data-goto="${keys[0]}"></a>`,
    })).toEqual(keys.slice(0, MAX_SCREEN_LINKS));
  });

  it("returns links from valid files without throwing on malformed source", () => {
    expect(extractLinks({
      "broken.tsx": `orion.goto('broken'); const node = <`,
      "good.ts": `const destination: string = 'home'; orion.goto('home');`,
      "index.html": `<script>orion.goto(</script><button data-goto="profile">`,
    })).toEqual(["home", "profile"]);
  });

  it("does not leak state between files or calls", () => {
    const files = { "a.ts": `orion.goto("home")`, "b.html": `<a data-goto='profile'></a>` };
    expect(extractLinks(files)).toEqual(["home", "profile"]);
    expect(extractLinks(files)).toEqual(["home", "profile"]);
    expect(extractLinks({})).toEqual([]);
    expect(extractLinks({ "a.html": `<a data-goto="stats"></a>` })).toEqual(["stats"]);
  });
});
