import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findMisplacedTests,
  testSourceCandidates,
} from "./check-test-colocation.mjs";

test("accepts a test beside a .ts module", () => {
  assert.deepEqual(
    findMisplacedTests([
      "src/features/discovery/repository.ts",
      "src/features/discovery/repository.test.ts",
    ]),
    [],
  );
});

test("accepts a .test.tsx beside a .tsx module", () => {
  assert.deepEqual(
    findMisplacedTests([
      "src/ui/app-frame.tsx",
      "src/ui/app-frame.test.tsx",
    ]),
    [],
  );
});

test("accepts a .test.ts covering a .tsx module", () => {
  // app/page.tsx is covered by app/page.test.ts -- the extensions differ
  // but the module is still the sibling.
  assert.deepEqual(
    findMisplacedTests(["src/app/page.tsx", "src/app/page.test.ts"]),
    [],
  );
});

test("flags a test one directory above its module", () => {
  const misplaced = findMisplacedTests([
    "src/features/discovery/components/composer.tsx",
    "src/features/discovery/composer.test.tsx",
  ]);
  assert.equal(misplaced.length, 1);
  assert.equal(
    misplaced[0].testPath,
    "src/features/discovery/composer.test.tsx",
  );
  assert.deepEqual(misplaced[0].expected, [
    "src/features/discovery/composer.ts",
    "src/features/discovery/composer.tsx",
  ]);
});

test("flags a test whose module does not exist anywhere", () => {
  const misplaced = findMisplacedTests([
    "src/features/discovery/schemas.ts",
    "src/features/discovery/upload-config.test.ts",
  ]);
  assert.equal(misplaced.length, 1);
  assert.equal(
    misplaced[0].testPath,
    "src/features/discovery/upload-config.test.ts",
  );
});

test("does not treat a same-named module in another directory as colocation", () => {
  const misplaced = findMisplacedTests([
    "src/features/home/components/composer.tsx",
    "src/features/discovery/composer.test.tsx",
  ]);
  assert.equal(misplaced.length, 1);
});

test("reports every misplaced test, sorted", () => {
  const misplaced = findMisplacedTests([
    "src/b.test.ts",
    "src/a.test.ts",
  ]);
  assert.deepEqual(
    misplaced.map(({ testPath }) => testPath),
    ["src/a.test.ts", "src/b.test.ts"],
  );
});

test("ignores non-test files entirely", () => {
  assert.deepEqual(
    findMisplacedTests(["src/lonely.ts", "README.md"]),
    [],
  );
});

test("prefers the exact dotted stem over the facet-stripped one", () => {
  // next.config.test.ts must resolve to next.config.ts, never next.ts.
  assert.deepEqual(testSourceCandidates("apps/web/next.config.test.ts"), [
    "apps/web/next.config.ts",
    "apps/web/next.config.tsx",
    "apps/web/next.ts",
    "apps/web/next.tsx",
  ]);
  assert.deepEqual(
    findMisplacedTests([
      "apps/web/next.config.ts",
      "apps/web/next.config.test.ts",
    ]),
    [],
  );
});

test("accepts a suite split by facet beside the module it covers", () => {
  assert.deepEqual(
    findMisplacedTests([
      "src/features/discovery/components/composer.tsx",
      "src/features/discovery/components/composer.test.tsx",
      "src/features/discovery/components/composer.attachments.test.tsx",
      "src/features/discovery/components/composer.mentions.test.tsx",
    ]),
    [],
  );
});

test("accepts gateway integration suites beside their modules", () => {
  assert.deepEqual(
    findMisplacedTests([
      "apps/gateway/src/server.ts",
      "apps/gateway/src/server.integration.test.ts",
    ]),
    [],
  );
});

test("rejects a facet split whose base module is elsewhere", () => {
  const misplaced = findMisplacedTests([
    "src/features/discovery/components/composer.tsx",
    "src/features/discovery/composer.attachments.test.tsx",
  ]);
  assert.equal(misplaced.length, 1);
  assert.equal(
    misplaced[0].testPath,
    "src/features/discovery/composer.attachments.test.tsx",
  );
});
