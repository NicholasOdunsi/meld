import { describe, expect, it } from "vitest";
import { compileScreen } from "../compile";
import { MAX_SCREEN_SOURCE_BYTES } from "../source";
import { applyTweak, inspectElement } from "./index";
import { FIELDS } from "./types";

const jsxPrefix = "export default () => ";
function tag(file: string, source: string, start = 0) {
  return `${file}:${start}:${source.length}`;
}

describe("source editing API", () => {
  it("escapes only the selected HTML text and keeps the input immutable", () => {
    const files = Object.freeze({
      "index.html": "<b>Hello</b>",
      "styles.css": "/* untouched */\r\n",
    });
    expect(
      applyTweak(files, "index.html:0:12", { field: "text", value: "A & B" }),
    ).toEqual({
      ok: true,
      files: { ...files, "index.html": "<b>A &amp; B</b>" },
    });
    expect(files["index.html"]).toBe("<b>Hello</b>");
  });

  it.each(["tsx", "jsx", "ts", "js"])(
    "edits a literal in a .%s file and round-trips escapes",
    (extension) => {
      const file = `ui/App.${extension}`;
      const source = jsxPrefix + "<b>ok</b>";
      // The Text field's value is trimmed: the trailing line break is not written.
      const value = 'Click {here} & "say" \\ 😀';
      const first = applyTweak(
        { [file]: source },
        tag(file, source, jsxPrefix.length),
        { field: "text", value: value + "\n" },
      );
      expect(first).toEqual({
        ok: true,
        files: { [file]: jsxPrefix + "<b>{" + JSON.stringify(value) + "}</b>" },
      });
      if (!first.ok) throw new Error(first.reason);
      const next = first.files[file];
      expect(
        inspectElement(first.files, tag(file, next, jsxPrefix.length))?.text,
      ).toEqual({ editable: true, value });
      expect(
        applyTweak(first.files, tag(file, next, jsxPrefix.length), {
          field: "text",
          value: "again",
        }),
      ).toEqual({
        ok: true,
        files: { [file]: jsxPrefix + '<b>{"again"}</b>' },
      });
    },
  );

  // A layout container holding only elements has no text to edit (a text tag like <b> would take
  // typed text next to its <i>, see html.test/jsx.test "cleared run").
  it.each(["<b>{name}</b>", "<b>Hello {name}</b>", "<div><i>Hi</i></div>"])(
    "declines mixed or computed text %s",
    (element) => {
      const source = jsxPrefix + element;
      expect(
        applyTweak(
          { "App.tsx": source },
          tag("App.tsx", source, jsxPrefix.length),
          { field: "text", value: "plain" },
        ),
      ).toEqual({ ok: false, reason: "not-literal" });
    },
  );

  it.each([
    "index.html:0:11",
    "index.html:1:12",
    "index.html:0:120",
    "index.html:0:0",
    "index.html:0:12\n",
    "index.html:-1:12",
    "index.html:0:9007199254740992",
    "missing.html:0:12",
    "styles.css:0:12",
  ])("rejects stale or invalid source identity %s", (src) => {
    const files = {
      "index.html": "<b>Hello</b>",
      "styles.css": "<b>Hello</b>",
    };
    expect(inspectElement(files, src)).toBeNull();
    expect(applyTweak(files, src, { field: "text", value: "x" })).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("requires an own file key and valid authored file map", () => {
    const inherited = Object.create({ "index.html": "<b>Hello</b>" });
    expect(inspectElement(inherited, "index.html:0:12")).toBeNull();
    expect(
      inspectElement({ "../index.html": "<b>Hello</b>" }, "../index.html:0:12"),
    ).toBeNull();
  });

  it("rejects malformed JSX without exposing parser exceptions", () => {
    const source = jsxPrefix + "<b>";
    expect(
      inspectElement(
        { "App.tsx": source },
        tag("App.tsx", source, jsxPrefix.length),
      ),
    ).toBeNull();
  });

  it("validates the complete edited file map before returning a replacement", () => {
    const files = { "index.html": "<b>Hello</b>" };
    expect(
      applyTweak(files, "index.html:0:12", {
        field: "text",
        value: "😀".repeat(MAX_SCREEN_SOURCE_BYTES),
      }),
    ).toEqual({ ok: false, reason: "not-literal" });
  });

  it.each(["html", "react"] as const)(
    "resolves actual compiler-issued %s tags with Unicode offsets",
    (kind) => {
      const file = kind === "html" ? "index.html" : "App.tsx";
      const source =
        kind === "html"
          ? "<main>😀<b>Pick</b></main>"
          : jsxPrefix + "<main>😀<b>Pick</b></main>";
      const compiled = compileScreen(
        { kind, files: { [file]: source }, entry: file },
        { tagElements: true },
      );
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.errors));
      const tags = [
        ...(compiled.screen.html + compiled.screen.scripts.join("\n")).matchAll(
          /(?:index\.html|App\.tsx):\d+:\d+/g,
        ),
      ].map((match) => match[0]);
      const expected = `${file}:${source.indexOf("<b>")}:${source.indexOf("</b>") + 4}`;
      expect(tags).toContain(expected);
      expect(inspectElement({ [file]: source }, expected)?.text).toEqual({
        editable: true,
        value: "Pick",
      });
      expect(
        Object.keys(inspectElement({ [file]: source }, expected)!),
      ).toEqual([...FIELDS]);
    },
  );

  describe("font family", () => {
    const sans = "ui-sans-serif, system-ui, sans-serif";
    const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
    it("swaps an existing family utility in HTML", () => {
      const s = '<b class="font-serif">Hi</b>';
      expect(
        applyTweak({ "index.html": s }, tag("index.html", s), {
          field: "fontFamily",
          value: "mono",
        }),
      ).toEqual({
        ok: true,
        files: { "index.html": '<b class="font-mono">Hi</b>' },
      });
    });
    it("adds an inline family to HTML that has none, and reads it back", () => {
      const s = "<b>Hi</b>";
      const out = applyTweak({ "index.html": s }, tag("index.html", s), {
        field: "fontFamily",
        value: "mono",
      });
      expect(out).toEqual({
        ok: true,
        files: { "index.html": `<b style="font-family: ${mono}">Hi</b>` },
      });
      const t = `<p style="font-family: ${sans}">x</p>`;
      expect(
        inspectElement({ "index.html": t }, tag("index.html", t))!.fontFamily,
      ).toEqual({ editable: true, value: "sans" });
    });
    it("is editable but unnamed when the code uses a custom stack", () => {
      const s = '<p style="font-family: Inter">x</p>';
      expect(
        inspectElement({ "index.html": s }, tag("index.html", s))!.fontFamily,
      ).toEqual({ editable: true, value: null });
    });
    it("adds a style prop in JSX without disturbing className", () => {
      const s = '<p className="font-bold">x</p>';
      const files = { "App.tsx": jsxPrefix + s };
      const out = applyTweak(
        files,
        tag("App.tsx", files["App.tsx"], jsxPrefix.length),
        { field: "fontFamily", value: "serif" },
      );
      expect(out).toEqual({
        ok: true,
        files: {
          "App.tsx":
            jsxPrefix +
            '<p style={{fontFamily:"ui-serif, Georgia, serif"}} className="font-bold">x</p>',
        },
      });
    });
    it("does not let an important family utility be shadowed", () => {
      const s = '<p class="!font-serif">x</p>';
      expect(
        inspectElement({ "index.html": s }, tag("index.html", s))!.fontFamily
          .editable,
      ).toBe(false);
    });
    it("keeps a font weight utility out of the family field", () => {
      const s = '<p class="font-bold">x</p>';
      const r = inspectElement({ "index.html": s }, tag("index.html", s))!;
      expect(r.fontWeight.value).toBe("700");
      expect(r.fontFamily.value).toBeNull();
    });
  });
});

it("bundles the edit entry for a browser worker without Node builtins", async () => {
  const { build } = await import("esbuild");
  const { fileURLToPath } = await import("node:url");
  const result = await build({
    entryPoints: [fileURLToPath(new URL("./index.ts", import.meta.url))],
    bundle: true,
    platform: "browser",
    format: "esm",
    write: false,
    metafile: true,
  });
  expect(
    Object.keys(result.metafile!.inputs).some((path) =>
      path.includes("postcss"),
    ),
  ).toBe(true);
  expect(
    Object.values(result.metafile!.outputs).flatMap((output) => output.imports),
  ).toEqual([]);
});

it.each([
  ["index.html", '<b class="!text-red-500">Hi</b>', "color"],
  ["index.html", '<b class="!w-[calc(100%-2px)]">Hi</b>', "width"],
  ["App.tsx", '<b className="!p-[var(--pad)]">Hi</b>', "padding"],
  ["index.html", '<b class="text-red-500 text-blue-500!">Hi</b>', "color"],
  ["App.tsx", '<b className="!text-red-500">Hi</b>', "color"],
  ["App.tsx", '<b className="text-red-500 text-blue-500!">Hi</b>', "color"],
  ["App.tsx", '<b style={{font:"12px Arial"}}>Hi</b>', "fontSize"],
  ["App.tsx", '<b style={{all:"initial"}}>Hi</b>', "width"],
  ["App.tsx", '<b style={{background:"red"}}>Hi</b>', "backgroundColor"],
  ["App.tsx", "<b style={{paddingLeft:12}}>Hi</b>", "padding"],
] as const)("disables ambiguous ownership in %s %s", (file, source, field) => {
  const files = { [file]: source };
  expect(inspectElement(files, tag(file, source))?.[field].editable).toBe(
    false,
  );
  expect(
    applyTweak(files, tag(file, source), {
      field,
      value:
        field === "color" || field === "backgroundColor" ? "#abcdef" : "20",
    }),
  ).toEqual({ ok: false, reason: "not-literal" });
});
