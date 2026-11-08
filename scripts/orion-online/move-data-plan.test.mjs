import assert from "node:assert/strict";
import { test } from "node:test";
import { MOVED_TABLES, rewriteRow, rewriteStoragePath } from "./move-data-plan.mjs";

const ids = { sourceWorkspaceId: "ws-old", targetWorkspaceId: "ws-new", sourceUserId: "u-old", targetUserId: "u-new" };

test("moves only library, taste and design-system tables, parents first", () => {
  assert.deepEqual(MOVED_TABLES, [
    "inspiration_items", "inspiration_labels", "taste_profiles",
    "taste_suggestions", "design_system_profiles", "design_system_profile_versions",
  ]);
  assert.ok(!MOVED_TABLES.includes("room_inspiration"));
  assert.ok(!MOVED_TABLES.includes("taste_signals"));
});

test("rewrites workspace and user ids, keeps primary keys and content", () => {
  const row = { id: "item-1", workspace_id: "ws-old", created_by: "u-old", note: "hi",
    storage_path: "ws-old/item-1.jpg" };
  assert.deepEqual(rewriteRow("inspiration_items", row, ids), {
    id: "item-1", workspace_id: "ws-new", created_by: "u-new", note: "hi", storage_path: "ws-new/item-1.jpg",
  });
});

test("rewrites taste user ids", () => {
  const row = { workspace_id: "ws-old", user_id: "u-old", board: { a: 1 } };
  assert.deepEqual(rewriteRow("taste_profiles", row, ids), { workspace_id: "ws-new", user_id: "u-new", board: { a: 1 } });
});

test("refuses rows that belong to someone else", () => {
  assert.throws(() => rewriteRow("inspiration_items", { workspace_id: "other", created_by: "u-old" }, ids));
});

test("rewrites only the leading workspace segment of a storage path", () => {
  assert.equal(rewriteStoragePath("ws-old/a/ws-old.jpg", ids), "ws-new/a/ws-old.jpg");
  assert.equal(rewriteStoragePath(null, ids), null);
});
