import assert from "node:assert/strict";
import { test } from "node:test";
import { findDestructiveStatements } from "./migration-guard.mjs";

test("passes additive migrations", () => {
  assert.deepEqual(findDestructiveStatements("create table a (id int);\nalter table a add column b text;"), []);
});

test("flags drops, truncates and deletes in any case", () => {
  const sql = "DROP TABLE a;\nalter table b drop column c;\nTruncate d;\ndelete from e where true;\nALTER TABLE f DROP CONSTRAINT g;";
  assert.equal(findDestructiveStatements(sql).length, 5);
});

test("ignores matches inside SQL comments", () => {
  assert.deepEqual(findDestructiveStatements("-- we never drop table here\ncreate table x (id int);"), []);
});

test("allows anything with the explicit marker", () => {
  assert.deepEqual(findDestructiveStatements("-- orion-allow-destructive\ndrop table a;"), []);
});

test("does not flag drop function / drop policy / drop trigger (recreated objects)", () => {
  assert.deepEqual(findDestructiveStatements("drop function if exists f();\ndrop policy p on t;\ndrop trigger t on x;"), []);
});
