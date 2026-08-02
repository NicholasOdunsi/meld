import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkContractEnumParity,
  compareContractEnums,
  parseSqlEnums,
  parseSqlEnumsFromFiles,
} from "./check-contract-enum-parity.mjs";

const CONTRACT_ENUMS = {
  ai_provider: ["codex", "claude"],
  ai_task_status: ["queued", "running"],
};

const SETUP_CONTRACT_ENUMS = {
  ...CONTRACT_ENUMS,
  provider_setup_stage: ["installing", "verifying"],
};

const SQL_FIXTURE = `
  create type public.ai_provider as enum ('codex', 'claude');
  create type public.ai_task_status as enum ('queued', 'running');
`;

test("accepts exact SQL and contract enum sets", async () => {
  const sqlEnums = await parseSqlEnums(SQL_FIXTURE);

  assert.deepEqual(compareContractEnums(sqlEnums, CONTRACT_ENUMS), []);
});

test("reports a contract value missing from SQL with its enum name", async () => {
  const sqlEnums = await parseSqlEnums(`
    create type public.ai_provider as enum ('codex');
    create type public.ai_task_status as enum ('queued', 'running');
  `);

  assert.deepEqual(compareContractEnums(sqlEnums, CONTRACT_ENUMS), [
    "ai_provider: SQL is missing contract value \"claude\"",
  ]);
});

test("reports an extra SQL value with its enum name", async () => {
  const sqlEnums = await parseSqlEnums(`
    create type public.ai_provider as enum ('codex', 'claude', 'other');
    create type public.ai_task_status as enum ('queued', 'running');
  `);

  assert.deepEqual(compareContractEnums(sqlEnums, CONTRACT_ENUMS), [
    "ai_provider: SQL has extra value \"other\"",
  ]);
});

test("fails when a migration path is missing", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "meld-enum-parity-"));
  context.after(() => rm(directory, { recursive: true }));
  const missingPath = join(directory, "missing.sql");

  await assert.rejects(
    checkContractEnumParity({
      migrationPaths: [missingPath],
      contractEnums: CONTRACT_ENUMS,
    }),
    new RegExp(`${missingPath}: migration file is missing`),
  );
});

// The enums the contracts describe are spread over more than one migration,
// so a single-file read would report every enum in the later migration as
// "SQL enum is missing" even though the type exists.
test("compares against enums declared across several migrations", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "meld-enum-parity-"));
  context.after(() => rm(directory, { recursive: true }));
  const firstPath = join(directory, "first.sql");
  const secondPath = join(directory, "second.sql");
  await writeFile(firstPath, SQL_FIXTURE);
  await writeFile(
    secondPath,
    "create type public.provider_setup_stage as enum "
      + "('installing', 'verifying');",
  );

  assert.deepEqual(
    await checkContractEnumParity({
      migrationPaths: [firstPath, secondPath],
      contractEnums: SETUP_CONTRACT_ENUMS,
    }),
    [],
  );
});

test("rejects one enum declared in two migrations", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "meld-enum-parity-"));
  context.after(() => rm(directory, { recursive: true }));
  const firstPath = join(directory, "first.sql");
  const secondPath = join(directory, "second.sql");
  await writeFile(firstPath, SQL_FIXTURE);
  await writeFile(
    secondPath,
    "create type public.ai_provider as enum ('codex');",
  );

  await assert.rejects(
    parseSqlEnumsFromFiles([firstPath, secondPath]),
    /ai_provider: SQL enum is declared in more than one migration/,
  );
});
