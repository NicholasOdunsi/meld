import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  checkContractEnumParity,
  compareContractEnums,
  parseSqlEnums,
} from "./check-contract-enum-parity.mjs";

const CONTRACT_ENUMS = {
  ai_provider: ["codex", "claude"],
  ai_task_status: ["queued", "running"],
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

test("fails when the migration path is missing", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "meld-enum-parity-"));
  context.after(() => rm(directory, { recursive: true }));
  const missingPath = join(directory, "missing.sql");

  await assert.rejects(
    checkContractEnumParity({
      migrationPath: missingPath,
      contractEnums: CONTRACT_ENUMS,
    }),
    new RegExp(`${missingPath}: migration file is missing`),
  );
});
