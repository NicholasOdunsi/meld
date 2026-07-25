import { readFileSync } from "node:fs";
import { loadModule, parse } from "pgsql-parser";

const paths = [
  "supabase/migrations/202607240004_discovery.sql",
  "supabase/migrations/202607250001_create_discovery_room_rpc.sql",
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
  "join public.memberships as membership",
  "and membership.user_id = participant.user_id",
  "foreign key (message_id, room_id)",
  "references public.messages(id, room_id)",
  "foreign key (attachment_id, room_id)",
  "references public.attachments(id, room_id)",
  "foreign key (source_message_id, room_id)",
  "owner_id = auth.uid()::text",
  "alter publication supabase_realtime",
  "add table public.messages, public.mentions, public.decisions",
];

for (const fragment of requiredFragments) {
  if (!migration.includes(fragment)) {
    throw new Error(`Discovery SQL is missing: ${fragment}`);
  }
}

const requiredFragmentCounts = [
  {
    fragment:
      "references public.messages(id, room_id) on delete restrict",
    count: 3,
  },
  {
    fragment:
      "references public.attachments(id, room_id) on delete restrict",
    count: 1,
  },
];

for (const { fragment, count } of requiredFragmentCounts) {
  const actual = migration.split(fragment).length - 1;
  if (actual !== count) {
    throw new Error(
      `Discovery SQL expected ${count} occurrences of ${fragment}; found ${actual}`,
    );
  }
}
