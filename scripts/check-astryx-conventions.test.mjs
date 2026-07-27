import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  checkSource,
  checkTree,
} from "./check-astryx-conventions.mjs";

const checkerPath = fileURLToPath(
  new URL("./check-astryx-conventions.mjs", import.meta.url),
);
const temporaryRoots = [];

function makeTemporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "meld-astryx-check-"));
  temporaryRoots.push(root);
  return root;
}

function writeFixture(root, relativePath, source) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  return path;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

test("allows Astryx props and token-backed source styles", () => {
  assert.deepEqual(
    checkSource(`
      export const Good = () => (
        <VStack
          gap={4}
          width={16}
          color="red"
          style={{
            width: "var(--spacing-4)",
            color: "var(--color-text-primary)",
          }}
        />
      );
      .good {
        width: var(--spacing-4);
        color: var(--color-text-primary);
      }
      const props = { color: "red", width: "16px" };
      export const AlsoGood = () => <Token {...props} />;
    `),
    [],
  );
});

test("rejects raw div and span layout elements", () => {
  assert.match(checkSource(`export const Bad = () => <div />`)[0], /raw <div>/);
  assert.match(
    checkSource(`export const Bad = () => <span>Label</span>`)[0],
    /raw <span>/,
  );
});

test("rejects utility classes and compiler directives", () => {
  assert.match(
    checkSource(`export const Bad = () => <Stack className="p-4 bg-white" />`)[0],
    /utility class/,
  );
  assert.match(checkSource(`@apply p-4;`)[0], /Tailwind\/StyleX compiler usage/);
  assert.match(
    checkSource(`@import "tailwindcss";`)[0],
    /Tailwind\/StyleX compiler usage/,
  );
  assert.match(
    checkSource(`const styles = stylex.create({ root: { display: "flex" } });`)[0],
    /Tailwind\/StyleX compiler usage/,
  );
  assert.match(
    checkSource(`export const Bad = () => <Stack xstyle={styles.root} />`)[0],
    /Tailwind\/StyleX compiler usage/,
  );
});

test("rejects hardcoded CSS and inline-style pixels", () => {
  assert.match(
    checkSource(`export const Bad = () => <Stack style={{ width: "16px" }} />`)[0],
    /hardcoded pixel/,
  );
  assert.match(
    checkSource(`export const Bad = () => <Stack style={{ width: 16 }} />`)[0],
    /hardcoded pixel/,
  );
  assert.match(checkSource(`.bad { padding: 16px; }`)[0], /hardcoded pixel/);
});

test("rejects supported literal color forms in source styles", () => {
  const cases = [
    `export const Bad = () => <Stack style={{ color: "#fff" }} />`,
    `.bad { color: #fff; }`,
    `.bad { color: rgb(255 255 255); }`,
    `.bad { color: rgba(255, 255, 255, 0.8); }`,
    `.bad { background-color: hsl(0 0% 100%); }`,
    `.bad { background-color: hsla(0, 0%, 100%, 0.8); }`,
    `.bad { color: hwb(0 0% 0%); }`,
    `.bad { color: lab(100% 0 0); }`,
    `.bad { color: lch(100% 0 0); }`,
    `.bad { color: oklab(100% 0 0); }`,
    `.bad { border-color: oklch(100% 0 0); }`,
    `.bad { color: color(display-p3 1 1 1); }`,
    `.bad { color: red; }`,
    `.bad { --custom-color: #fff; }`,
  ];

  for (const source of cases) {
    assert.match(checkSource(source)[0], /hardcoded color/);
  }
});

test("reports violations from nested source files only", () => {
  const root = makeTemporaryRoot();
  const badPath = writeFixture(
    root,
    "nested/bad.tsx",
    `export const Bad = () => <span style={{ width: 16 }} />;`,
  );
  writeFixture(root, "notes.md", `<div style={{ color: "#fff" }} />`);

  assert.deepEqual(checkTree(root), [
    `${badPath}: raw <span> layout`,
    `${badPath}: hardcoded pixel`,
  ]);
});

test("CLI prints every violation and exits one", () => {
  const root = makeTemporaryRoot();
  const badPath = writeFixture(
    root,
    "bad.css",
    `.bad { width: 16px; color: rgb(255 255 255); }`,
  );

  const result = spawnSync(process.execPath, [checkerPath, root], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, new RegExp(`${badPath}: hardcoded pixel`));
  assert.match(result.stderr, new RegExp(`${badPath}: hardcoded color`));
});

test("CLI requires at least one source root", () => {
  const result = spawnSync(process.execPath, [checkerPath], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage:/);
});
