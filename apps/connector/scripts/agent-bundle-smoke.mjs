import assert from "node:assert/strict";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

const connectorRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const artifact = path.join(connectorRoot, "dist", "agent.mjs");
const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "meld-connector-bundle-"),
);
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((specifier) => `node:${specifier}`),
]);

function bareModuleSpecifiers(source) {
  const specifiers = [];
  const staticImport =
    /\b(?:import|export)\s+(?:[^"'()]*?\s+from\s*)?["']([^"']+)["']/g;
  const dynamicImport = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

  for (const pattern of [staticImport, dynamicImport]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (
        specifier !== undefined &&
        !nodeBuiltins.has(specifier) &&
        !specifier.startsWith("./") &&
        !specifier.startsWith("../") &&
        !specifier.startsWith("file:")
      ) {
        specifiers.push(specifier);
      }
    }
  }

  return specifiers;
}

try {
  const relocatedAgent = path.join(temporaryRoot, "agent.mjs");
  const temporaryHome = path.join(temporaryRoot, "home");
  await mkdir(temporaryHome);
  await copyFile(artifact, relocatedAgent);
  const invokedAgent = await realpath(relocatedAgent);

  const source = await readFile(relocatedAgent, "utf8");
  assert.deepEqual(
    bareModuleSpecifiers(source),
    [],
    "agent.mjs contains bare non-Node runtime imports",
  );
  assert.doesNotMatch(source, /\b(?:from\s+|import\s*\()["'](?:ws|zod)(?:\/|["'])/);

  const result = spawnSync(process.execPath, [invokedAgent], {
    cwd: temporaryRoot,
    env: {
      ...process.env,
      HOME: temporaryHome,
    },
    encoding: "utf8",
    timeout: 10_000,
  });
  const diagnostic = `${result.stdout}${result.stderr}`;

  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.match(diagnostic, /Meld connector is not configured/);
  assert.doesNotMatch(diagnostic, /ERR_MODULE_NOT_FOUND/);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
