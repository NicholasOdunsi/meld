import { readFileSync } from "node:fs";
import { loadModule, parse } from "pgsql-parser";

const paths = [
  "supabase/migrations/202607240004_discovery.sql",
  "supabase/tests/discovery_access.test.sql",
];

await loadModule();

for (const path of paths) {
  const sql = readFileSync(path, "utf8");
  await parse(sql);
  console.log(`${path}: PostgreSQL grammar OK`);
}

const migration = readFileSync(paths[0], "utf8");
const requiredFragments = [
  "create policy \"Room participants can receive private room events\"",
  "create policy \"Room participants can send private room events\"",
  "public.can_access_room_topic(realtime.topic())",
  "owner_id = auth.uid()::text",
  "alter publication supabase_realtime",
  "add table public.messages, public.mentions, public.decisions",
];

for (const fragment of requiredFragments) {
  if (!migration.includes(fragment)) {
    throw new Error(`Discovery SQL is missing: ${fragment}`);
  }
}
