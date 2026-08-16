import { readFileSync, readdirSync } from "node:fs";
import { loadModule, parse } from "pgsql-parser";

const legacyPaths = [
  "supabase/migrations/202607240004_discovery.sql",
  "supabase/migrations/202607250001_create_discovery_room_rpc.sql",
  "supabase/migrations/202607250004_mention_acknowledgement.sql",
  "supabase/migrations/202607260001_discovery_attachments_html_mime.sql",
  "supabase/migrations/202608020001_atomic_discovery_messages.sql",
  "supabase/migrations/202608020002_attachment_mime_parity.sql",
  "supabase/tests/room_access.test.sql",
  "supabase/tests/mention_acknowledgement.test.sql",
];
const forwardPaths = readdirSync("supabase/migrations")
  .filter((name) => /^2026081100.*\.sql$/.test(name))
  .sort()
  .map((name) => `supabase/migrations/${name}`);
const vocabularyTestPath =
  "supabase/tests/workspace_room_vocabulary.test.sql";
const surfaceBroadcastTestPath =
  "supabase/tests/room_surface_broadcast.test.sql";
const paths = [
  ...legacyPaths,
  ...forwardPaths,
  vocabularyTestPath,
  surfaceBroadcastTestPath,
];

await loadModule();

for (const path of paths) {
  const sql = readFileSync(path, "utf8");
  await parse(sql);
  console.log(`${path}: PostgreSQL grammar OK`);
}

const legacyMigration = readFileSync(legacyPaths[0], "utf8");
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
  if (!legacyMigration.includes(fragment)) {
    throw new Error(`Room SQL is missing legacy integrity fragment: ${fragment}`);
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
  const actual = legacyMigration.split(fragment).length - 1;
  if (actual !== count) {
    throw new Error(
      `Room SQL expected ${count} occurrences of ${fragment}; found ${actual}`,
    );
  }
}

const vocabularyMigration = readFileSync(
  "supabase/migrations/202608110001_workspace_room_vocabulary.sql",
  "utf8",
);
const finalVocabularyFragments = [
  "alter table public.discovery_rooms rename to rooms",
  "alter table public.rooms rename column organization_id to workspace_id",
  "rename constraint discovery_rooms_id_organization_id_key to rooms_id_workspace_id_key",
  "alter trigger protect_discovery_room_identity on public.rooms",
  "rename to protect_room_identity",
  'drop policy "Organization logos are publicly readable" on storage.objects',
  'create policy "Workspace logos are publicly readable"',
  "using (bucket_id = 'organization-logos')",
];

for (const fragment of finalVocabularyFragments) {
  if (!vocabularyMigration.includes(fragment)) {
    throw new Error(`Room SQL is missing final vocabulary fragment: ${fragment}`);
  }
}

const vocabularyTest = readFileSync(vocabularyTestPath, "utf8");
const finalCatalogAssertionFragments = [
  "policy.schemaname = 'realtime'",
  "policy.tablename = 'messages'",
  "Room participants can receive private room events",
  "Room participants can send private room events",
  "policy.qual like '%can_access_room_topic(realtime.topic())%'",
  "policy.with_check like '%can_access_room_topic(realtime.topic())%'",
  "from pg_proc as function_record",
  "pg_get_functiondef(function_record.oid) ilike '%from public.memberships%'",
  "public.is_workspace_member('92000000-0000-4000-8000-000000000001')",
  "public.is_workspace_admin('92000000-0000-4000-8000-000000000001')",
  "from pg_publication_tables as publication",
  "publication.pubname = 'supabase_realtime'",
  "from pg_constraint as constraint_record",
  "rooms_id_workspace_id_key",
  "mentions_message_id_room_id_fkey",
  "from pg_policies as policy",
  "Workspace logos are publicly readable",
  "concat(policy.qual, policy.with_check) like '%organization-logos%'",
];

for (const fragment of finalCatalogAssertionFragments) {
  if (!vocabularyTest.includes(fragment)) {
    throw new Error(
      `Room SQL is missing final catalog assertion: ${fragment}`,
    );
  }
}

const surfaceBroadcastMigration = readFileSync(
  "supabase/migrations/202608110006_room_surface_broadcast.sql",
  "utf8",
);
const surfaceBroadcastFragments = [
  "perform realtime.broadcast_changes(",
  "'room:' || target_room_id::text",
  "'room-surfaces-changed'",
  "after insert or delete on public.user_flows",
  "after insert or delete on public.decisions",
];

for (const fragment of surfaceBroadcastFragments) {
  if (!surfaceBroadcastMigration.includes(fragment)) {
    throw new Error(
      `Room SQL is missing surface broadcast fragment: ${fragment}`,
    );
  }
}
