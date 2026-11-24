import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { apply, inspect, restore } from "./edit-session";

const PAGE = [
  "export default function Home() {",
  "  return (",
  "    <main>",
  "      <p className=\"tagline\">Plan your day</p>",
  "      <h1>{greeting}</h1>",
  "    </main>",
  "  );",
  "}",
  "",
].join("\n");

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "preview-edit-"));
  await mkdir(path.join(root, "app"), { recursive: true });
  await writeFile(path.join(root, "app/page.tsx"), PAGE);
});

const tagline = { file: "app/page.tsx", line: 4, column: 7 };
const heading = { file: "app/page.tsx", line: 5, column: 7 };

describe("inspect", () => {
  it("lists editable fields for a literal element", async () => {
    const result = await inspect(root, tagline);
    expect(result.ok && result.fields.text).toMatchObject({ editable: true, value: "Plan your day" });
  });
  it("shows computed text as read-only", async () => {
    const result = await inspect(root, heading);
    expect(result.ok && result.fields.text.editable).toBe(false);
  });
  it("reports not-found for a position with no element", async () => {
    expect(await inspect(root, { ...tagline, column: 9 })).toEqual({ ok: false, reason: "not-found" });
  });
});

describe("apply", () => {
  it("changes literal text on disk and reports before and after", async () => {
    const result = await apply(root, tagline, { field: "text", value: "Plan it" });
    expect(result.ok).toBe(true);
    expect(await readFile(path.join(root, "app/page.tsx"), "utf8")).toContain('>{"Plan it"}</p>');
    if (result.ok) expect(result.changes).toEqual([{ path: "app/page.tsx", before: PAGE, after: PAGE.replace(">Plan your day<", '>{"Plan it"}<') }]);
  });
  it("adds an inline style when the element has none", async () => {
    await apply(root, tagline, { field: "color", value: "#ff0000" });
    expect(await readFile(path.join(root, "app/page.tsx"), "utf8")).toContain("color");
  });
  it("refuses computed text and writes nothing", async () => {
    expect(await apply(root, heading, { field: "text", value: "Hi" })).toEqual({ ok: false, reason: "not-literal" });
    expect(await readFile(path.join(root, "app/page.tsx"), "utf8")).toBe(PAGE);
  });
  it("refuses an invalid colour", async () => {
    expect(await apply(root, tagline, { field: "color", value: "red; background: url(x)" })).toEqual({ ok: false, reason: "not-literal" });
  });
});

describe("safe paths", () => {
  it("refuses files outside the root", async () => {
    expect(await inspect(root, { ...tagline, file: "../outside.tsx" })).toEqual({ ok: false, reason: "outside-root" });
    expect(await inspect(root, { ...tagline, file: "/etc/passwd" })).toEqual({ ok: false, reason: "outside-root" });
  });
  it("refuses node_modules and non-JSX files", async () => {
    await mkdir(path.join(root, "node_modules/x"), { recursive: true });
    await writeFile(path.join(root, "node_modules/x/a.tsx"), PAGE);
    await writeFile(path.join(root, "app/styles.css"), "a{}");
    expect(await inspect(root, { ...tagline, file: "node_modules/x/a.tsx" })).toEqual({ ok: false, reason: "outside-root" });
    expect(await inspect(root, { ...tagline, file: "app/styles.css" })).toEqual({ ok: false, reason: "outside-root" });
  });
  it("refuses a symlink that leaves the root", async () => {
    const elsewhere = await mkdtemp(path.join(os.tmpdir(), "preview-edit-out-"));
    await writeFile(path.join(elsewhere, "page.tsx"), PAGE);
    await symlink(path.join(elsewhere, "page.tsx"), path.join(root, "app/linked.tsx"));
    expect(await inspect(root, { ...tagline, file: "app/linked.tsx" })).toEqual({ ok: false, reason: "outside-root" });
  });
  it("accepts a plain .js file that contains JSX", async () => {
    await writeFile(path.join(root, "app/legacy.js"), "export const A = () => <p>Hi</p>;\n");
    const result = await inspect(root, { file: "app/legacy.js", line: 1, column: 24 });
    expect(result.ok && result.fields.text.value).toBe("Hi");
  });
  it("tries one column less for a fuzzy position, and only when asked", async () => {
    expect((await inspect(root, { ...tagline, column: 8 })).ok).toBe(false);
    expect((await inspect(root, { ...tagline, column: 8, fuzzy: true })).ok).toBe(true);
  });
  it("accepts an absolute path that is inside the root", async () => {
    expect((await inspect(root, { ...tagline, file: path.join(root, "app/page.tsx") })).ok).toBe(true);
  });
  it("refuses a very large file", async () => {
    await writeFile(path.join(root, "app/big.tsx"), "x".repeat(200_001));
    expect(await inspect(root, { ...tagline, file: "app/big.tsx" })).toEqual({ ok: false, reason: "too-large" });
  });
});

describe("restore", () => {
  it("writes the contents when the file still matches what is expected", async () => {
    const edited = await apply(root, tagline, { field: "text", value: "Plan it" });
    const change = edited.ok ? edited.changes[0]! : null;
    const undone = await restore(root, [{ path: change!.path, expect: change!.after, contents: change!.before }]);
    expect(undone.ok).toBe(true);
    expect(await readFile(path.join(root, "app/page.tsx"), "utf8")).toBe(PAGE);
  });
  it("refuses when the file changed since, and writes nothing", async () => {
    await writeFile(path.join(root, "app/page.tsx"), PAGE + "// agent edit\n");
    expect(await restore(root, [{ path: "app/page.tsx", expect: PAGE, contents: "x" }])).toEqual({ ok: false, reason: "conflict" });
    expect(await readFile(path.join(root, "app/page.tsx"), "utf8")).toBe(PAGE + "// agent edit\n");
  });
});
