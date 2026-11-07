#!/usr/bin/env node
import { createHash } from "node:crypto";
import postgres from "postgres";
import { MOVED_TABLES, rewriteRow } from "./move-data-plan.mjs";

const env = (name) => { const v = process.env[name]; if (!v) throw new Error(`Missing ${name}`); return v; };
const source = postgres(env("SOURCE_DB_URL"), { max: 1 });
const target = postgres(env("TARGET_DB_URL"), { max: 1, prepare: false });

const BUCKETS = { inspiration_items: ["inspiration", "storage_path"],
  design_system_profile_versions: ["design-system", "source_object_path"] };

async function single(sql, query, label) {
  const rows = await sql.unsafe(query);
  if (rows.length !== 1) throw new Error(`${label}: expected exactly 1, found ${rows.length}`);
  return rows[0];
}

async function download(base, key, bucket, path) {
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, { headers: { Authorization: `Bearer ${key}`, apikey: key } });
  if (!res.ok) throw new Error(`download ${bucket}/${path}: ${res.status}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "application/octet-stream" };
}

async function upload(base, key, bucket, path, file) {
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
    method: "POST", body: file.bytes,
    headers: { Authorization: `Bearer ${key}`, apikey: key, "content-type": file.type, "x-upsert": "true" } });
  if (!res.ok) throw new Error(`upload ${bucket}/${path}: ${res.status} ${await res.text()}`);
}

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

try {
  const src = await single(source, "select distinct workspace_id, created_by from inspiration_items", "source owner");
  const tgtUser = await single(target, "select id from auth.users", "target user");
  const tgtWs = await single(target, "select id from public.workspaces", "target workspace");
  const ids = { sourceWorkspaceId: src.workspace_id, sourceUserId: src.created_by,
    targetWorkspaceId: tgtWs.id, targetUserId: tgtUser.id };

  for (const table of MOVED_TABLES) {
    const rows = await source.unsafe(`select * from public.${table} where workspace_id = $1`, [ids.sourceWorkspaceId]);
    let copied = 0;
    for (const row of rows) {
      const next = rewriteRow(table, row, ids);
      const bucket = BUCKETS[table];
      if (bucket && row[bucket[1]]) {
        const file = await download(env("SOURCE_SUPABASE_URL"), env("SOURCE_SERVICE_KEY"), bucket[0], row[bucket[1]]);
        await upload(env("TARGET_SUPABASE_URL"), env("TARGET_SERVICE_KEY"), bucket[0], next[bucket[1]], file);
        const back = await download(env("TARGET_SUPABASE_URL"), env("TARGET_SERVICE_KEY"), bucket[0], next[bucket[1]]);
        if (sha(back.bytes) !== sha(file.bytes)) throw new Error(`hash mismatch ${bucket[0]}/${next[bucket[1]]}`);
      }
      const result = await target`insert into ${target("public." + table)} ${target(next)} on conflict do nothing`;
      copied += result.count;
    }
    const [{ count }] = await target.unsafe(`select count(*)::int as count from public.${table} where workspace_id = $1`, [ids.targetWorkspaceId]);
    if (count < rows.length) throw new Error(`${table}: target has ${count}, source has ${rows.length}`);
    console.log(`${table.padEnd(32)} ${rows.length} in source · ${copied} newly copied · ${count} online ✓`);
  }
} finally {
  await source.end();
  await target.end();
}
