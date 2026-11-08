export const MOVED_TABLES = [
  "inspiration_items", "inspiration_labels", "taste_profiles",
  "taste_suggestions", "design_system_profiles", "design_system_profile_versions",
];

const USER_COLUMNS = ["created_by", "user_id"];
const PATH_COLUMNS = ["storage_path", "source_object_path"];

export function rewriteStoragePath(path, ids) {
  if (path == null) return path;
  const prefix = `${ids.sourceWorkspaceId}/`;
  return path.startsWith(prefix) ? `${ids.targetWorkspaceId}/${path.slice(prefix.length)}` : path;
}

export function rewriteRow(table, row, ids) {
  if (!MOVED_TABLES.includes(table)) throw new Error(`Not a moved table: ${table}`);
  if ("workspace_id" in row && row.workspace_id !== ids.sourceWorkspaceId) {
    throw new Error(`${table}: row from unexpected workspace ${row.workspace_id}`);
  }
  const out = { ...row };
  if ("workspace_id" in out) out.workspace_id = ids.targetWorkspaceId;
  for (const column of USER_COLUMNS) {
    if (column in out && out[column] != null) {
      if (out[column] !== ids.sourceUserId) throw new Error(`${table}.${column}: unexpected user ${out[column]}`);
      out[column] = ids.targetUserId;
    }
  }
  for (const column of PATH_COLUMNS) {
    if (column in out) out[column] = rewriteStoragePath(out[column], ids);
  }
  return out;
}
