# Task 5 Report: Realtime Discovery Rooms

## Status

Implemented Task 5 only: authenticated Discovery Rooms with explicit room
participation, private Realtime authorization, private attachment storage,
safe extraction, optimistic message reconciliation, Astryx room/chat UI,
and a production-impossible deterministic browser-test fake.

The local machine has neither the Supabase CLI nor a runnable local
PostgreSQL service. The pgTAP suite is executable and PostgreSQL grammar
checked, but was not run against a live database. This report does not
claim live database behavior.

## RED / GREEN

### RED

Command:

```text
pnpm --filter web test -- discovery
```

Initial result:

```text
4 failed suites
Cannot find module './attachment-extractor'
Cannot find module './repository'
Cannot find module './schemas'
Failed to resolve './components/conversation'
```

Database RED command:

```text
supabase test db supabase/tests/discovery_access.test.sql
```

Result:

```text
zsh: command not found: supabase
```

This is an environment limitation, not a passing database result.

### GREEN

Focused unit/component result:

```text
Test Files 14 passed (14)
Tests      56 passed (56)
```

Focused browser result:

```text
1 passed
explicit participants exchange Discovery Room messages while an unrelated
member is denied
```

Full browser result:

```text
2 passed
```

Full workspace result:

```text
web       56 passed
contracts  6 passed
gateway    1 passed
```

The PostgreSQL grammar checker parsed both the migration and pgTAP file:

```text
supabase/migrations/202607240004_discovery.sql: PostgreSQL grammar OK
supabase/tests/discovery_access.test.sql: PostgreSQL grammar OK
```

## SQL Threat Cases

`supabase/tests/discovery_access.test.sql` contains 27 pgTAP assertions.
They cover:

- Room creation automatically creates an owner participant with `edit`
  access.
- An editor can add an organization member as an explicit participant.
- An editor cannot add an unrelated user who is not an organization member.
- An explicit participant can select the room and its messages.
- An explicit participant can post a message.
- An explicit participant cannot spoof another message author.
- Organization membership by itself cannot select a room or its messages.
- An organization member who is not a room participant cannot post.
- A non-participant cannot authorize `room:<uuid>`.
- A participant can authorize only the exact private room topic.
- Malformed room topics fail closed.
- `(room_id, client_id)` is unique for idempotent message retries.
- Owner participation cannot be removed or downgraded.
- Room organization and ownership are immutable.
- Participant identity and attribution are immutable.
- A participant can create a private room storage object.
- A non-participant cannot select or create private room objects.
- Private Realtime receive and send policies exist on
  `realtime.messages`.
- `messages`, `mentions`, and `decisions` are in the
  `supabase_realtime` publication.
- Valid storage paths derive the room ID from the first segment.
- Malformed/traversal storage paths fail closed.

The static SQL check uses `pgsql-parser` backed by PostgreSQL's grammar and
also asserts that required Realtime/storage policy fragments are present.

## Realtime and Storage Policy Design

### Room authorization

- `discovery_rooms` carries immutable `organization_id` and `owner_id`.
- `room_participants` is the only room-content authorization source.
- Organization membership is necessary to be added, but never sufficient to
  read room data.
- `is_room_participant(uuid)` and `can_edit_room(uuid)` are
  `security definer` helpers with an empty search path to avoid recursive RLS.
- The room owner is inserted by a protected trigger as an immutable edit
  participant.
- All author/uploader/creator IDs are obtained from the authenticated
  Supabase client, backed by RLS checks against `auth.uid()`.

### Realtime

- Production clients subscribe to a private channel named exactly
  `room:<uuid>`.
- PostgreSQL changes are filtered to the selected `room_id`.
- Table RLS protects every record delivered through Postgres Changes.
- `realtime.messages` has authenticated `select` and `insert` policies for
  broadcast/presence authorization. Both call
  `can_access_room_topic(realtime.topic())`.
- Topic parsing validates the full topic and UUID shape and fails closed.
- `messages`, `mentions`, and `decisions` are published.

### Deterministic development fake

- The fake requires all three conditions:
  `NODE_ENV !== "production"`,
  `MELD_E2E_FAKE_WORKSPACES === "true"`, and
  `MELD_E2E_FAKE_DISCOVERY === "true"`.
- Production paths do not fall through to the fake.
- Unit coverage proves the gate is false in production even when both flags
  are set.
- The shared development store mirrors organization membership, explicit
  participants, edit access, message idempotency, and room read/post
  authorization.
- Browser contexts receive persisted changes through short polling of the
  same authorization-checked server action. This provides deterministic
  cross-context event semantics without weakening production Realtime.
- The unrelated-member test covers list, direct read/subscribe, and post
  denial at the fake boundary.

### Storage

- The `discovery-attachments` bucket is private.
- It has a 10 MB limit and an explicit MIME allowlist.
- Object names are rooted at `<roomId>/...`; malformed and traversal paths
  fail closed.
- Room participants can read objects.
- Only the authenticated object owner and a current room participant can
  insert, update, or delete their object.
- The UI requests short-lived signed URLs only after attachment metadata
  passes room RLS. These URLs are for human viewing and never enter AI
  context construction.

## Attachment Security

The upload boundary validates metadata with Zod and bytes before storage.
Tests cover:

- 10 MB maximum.
- Fatal UTF-8 decoding for plain text and Markdown.
- NUL removal, newline/whitespace normalization, and a 100,000-character
  extraction cap.
- PDF `%PDF-` signature verification.
- Early rejection of `/Encrypt` password-protected PDFs.
- Invalid/unextractable PDF rejection.
- PNG, JPEG, WebP, and GIF byte signatures rather than trusting the browser
  MIME declaration.
- WebP requires both RIFF and WEBP markers.
- Images require a non-empty user caption.
- Images produce no extracted text.
- Unsupported MIME rejection.
- AI context includes only `ready` extracted text and user captions.
- AI context excludes failed extraction text, storage paths, and signed URLs.

The original object is uploaded only after validation/extraction succeeds.
If attachment metadata persistence fails, the uploaded object is removed.
Extraction status is constrained to `pending`, `ready`, `unsupported`, or
`failed`; synchronous MVP uploads persist text/PDF as `ready` and captioned
images as `unsupported`.

## Optimistic Message Reconciliation

- The browser generates a UUID `clientId`.
- The optimistic row is keyed by that client ID.
- Persisted action results and Realtime events reconcile by both `clientId`
  and server ID.
- The reducer removes duplicates before adding the persisted row.
- The database has a unique `(room_id, client_id)` constraint.
- A duplicate production retry reads and returns the original row instead of
  rewriting it.
- Unit coverage emits the persisted event before the action settles and
  verifies the message remains visible exactly once.

## Astryx Discovery and UI

Commands run before UI implementation:

```text
pnpm exec astryx build "realtime product Discovery Room with room list, shared conversation, Product Agent mention, attachments, evidence, and decisions"
pnpm exec astryx template ai-chat --skeleton
pnpm exec astryx component List
pnpm exec astryx component Item
pnpm exec astryx component Token
pnpm exec astryx docs layout
pnpm exec astryx component Layout
pnpm exec astryx component LayoutPanel
pnpm exec astryx component LayoutContent
pnpm exec astryx component ChatLayout
pnpm exec astryx component ChatMessageList
pnpm exec astryx component ChatMessage
pnpm exec astryx component ChatMessageBubble
pnpm exec astryx component ChatComposer
pnpm exec astryx component ChatComposerInput
pnpm exec astryx component FileInput
pnpm exec astryx component ListItem
```

Discovery chose the messaging archetype:

- `Layout` page frame.
- 256px room rail.
- Flexible conversation stream.
- 380px room inspector.
- Edge-to-edge `List` / `ListItem` rows.
- `ChatMessageList` and chat bubbles for the stream.
- `ChatComposer` for messaging.
- `FileInput` for attachments.
- `Token` for compact state metadata.

`pnpm check:astryx` passes. The implementation contains no authored raw
`div`/`span` layout, Tailwind/utility classes, StyleX compiler usage,
hardcoded visual colors, or inline hardcoded pixel styles.

The `@Product Agent` action is visible and disabled. The exact explanation
is:

```text
Connect personal AI to use the Product Agent
```

## Browser Status

The focused Chromium scenario:

1. Creates an organization.
2. Accepts an invitation in a second browser context.
3. Creates a Discovery Room.
4. Explicitly adds the invited member as a room participant.
5. Exchanges messages in both directions between the two contexts.
6. Verifies the Product Agent action and exact disabled explanation.
7. Adds a third user as an organization member without room participation.
8. Verifies that user cannot see the room in the list.
9. Verifies direct room navigation returns 404 and no message content.

Result: passed.

The full two-spec Playwright suite also passed. A transient development
server `ECONNRESET` was logged after a test context closed; both scenarios
completed successfully and Playwright exited zero.

## Commands and Results

```text
pnpm --filter web test -- discovery
PASS: 14 files, 56 tests

pnpm --filter web typecheck
PASS

pnpm check:astryx
PASS

pnpm check:sql-discovery
PASS: migration and pgTAP PostgreSQL grammar

pnpm test
PASS: Astryx tests, SQL static checks, web/contracts/gateway tests

pnpm lint
PASS

pnpm build
PASS: production Next.js build

pnpm exec playwright test e2e/discovery-room.spec.ts
PASS: 1 test

pnpm exec playwright test
PASS: 2 tests

supabase test db supabase/tests/discovery_access.test.sql
NOT RUN: Supabase CLI is unavailable
```

## Files Changed

Database and validation:

- `supabase/migrations/202607240004_discovery.sql`
- `supabase/tests/discovery_access.test.sql`
- `scripts/check-discovery-sql.mjs`
- `package.json`
- `pnpm-lock.yaml`

Discovery feature:

- `apps/web/src/features/discovery/actions.ts`
- `apps/web/src/features/discovery/attachment-extractor.ts`
- `apps/web/src/features/discovery/e2e-fake.ts`
- `apps/web/src/features/discovery/e2e-gate.ts`
- `apps/web/src/features/discovery/repository.ts`
- `apps/web/src/features/discovery/schemas.ts`
- `apps/web/src/features/discovery/components/attachment-upload.tsx`
- `apps/web/src/features/discovery/components/composer.tsx`
- `apps/web/src/features/discovery/components/conversation.tsx`
- `apps/web/src/features/discovery/components/room-inspector.tsx`
- `apps/web/src/features/discovery/components/room-list.tsx`

Discovery tests:

- `apps/web/src/features/discovery/attachment-extractor.test.ts`
- `apps/web/src/features/discovery/conversation.test.tsx`
- `apps/web/src/features/discovery/e2e-fake.test.ts`
- `apps/web/src/features/discovery/repository.test.ts`
- `apps/web/src/features/discovery/schemas.test.ts`
- `e2e/discovery-room.spec.ts`

Routes/integration:

- `apps/web/src/app/(app)/[organizationId]/discovery/page.tsx`
- `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`
- `apps/web/src/app/(app)/[organizationId]/layout.tsx`
- `apps/web/src/ui/app-frame.test.tsx`
- `apps/web/package.json`
- `playwright.config.ts`

The untracked user file `docs/product-feature-checklist.md` was left
untouched and is not included in the commit.

## Self-Review

Security review findings fixed before completion:

- Removed caller-provided author/uploader/creator IDs from repository
  mutation APIs; the repository calls `auth.getUser()`.
- Added immutable room organization/owner and participant identity
  enforcement.
- Corrected duplicate `clientId` handling so retries return the original row
  without overwriting message content.
- Added malformed topic and storage path fail-closed behavior.
- Strengthened WebP and GIF/JPEG/PNG byte sniffing.
- Kept short-lived signed object URLs separate from AI context.
- Replaced a raw anchor test fixture after the new `/discovery` route caused
  Next.js lint to recognize it as an internal route.
- Re-read all authored UI and ran the repository Astryx convention checker.

No known Task 5 implementation defect remains from static, unit,
integration, browser, lint, type, or production-build checks.

## Concerns

- Live migration application, RLS execution, Realtime authorization, storage
  policy execution, and pgTAP results remain unverified because the Supabase
  CLI/PostgreSQL environment is unavailable.
- The deterministic development transport uses polling, not a local Realtime
  server. It mirrors authorization and event reconciliation but is not
  evidence of live Supabase delivery behavior.
- PDF parser behavior is unit-covered at the validation boundary, but no
  password-protected PDF fixture is committed; `/Encrypt` rejection and
  extraction error handling are covered with deterministic byte inputs.

## Fix Round 1

This section supersedes the earlier attachment rollback description.

### Current-membership authorization

`is_room_participant` and `can_edit_room` now join the room's organization
and require a current `memberships` row in addition to historical
`room_participants` state. All room, message, storage, and private Realtime
policies inherit that fail-closed check. Room deletion also requires the
owner to remain a current participant.

The pgTAP plan increased from 27 to 39 assertions. New cases remove an
organization membership without deleting the participant record and verify
that the stale user immediately loses:

- room listing;
- message reads and posting;
- editor authorization;
- private Realtime topic authorization;
- private object reads and uploads.

The historical participant row remains visible to the current owner.
The deterministic fake mirrors the same revocation behavior and now rejects
owner access downgrades and owner participant removal.

### Room-local references

Messages and attachments now expose composite `(id, room_id)` uniqueness.
Composite foreign keys enforce room locality for:

- mention-to-message references;
- attachment-to-message references;
- evidence-to-message and evidence-to-attachment references;
- decision-to-source-message references.

Four SQL negative cases assert `23503` for cross-room references. Repository
negative tests confirm attachment, evidence, and decision writes surface the
database rejection rather than retrying or rewriting it. The SQL static
guard also requires the membership joins, composite references, private
Realtime policies, and `realtime.topic()` authorization.

### Attachment transport and persistence

The installed Next.js 16.2.11 type and schema definitions were inspected
locally. They define the setting as
`experimental.serverActions.bodySizeLimit`; it is configured to `11mb` so a
10 MiB attachment plus multipart metadata can reach the action. The Zod
schema, extractor, database check, and storage bucket retain the exact
10 MiB application limit. A config guard and exact-boundary schema test
prevent drift.

Uploads now create a durable `pending` attachment record before writing the
object. A storage rejection marks that record `failed`. A successful object
write is finalized to `ready` or `unsupported`. If finalization is
temporarily unavailable, the pending metadata still tracks the exact object
path and the action reports that finalization is pending. No best-effort
object deletion is used, so an ignored cleanup result cannot create a silent
orphan. Unit tests cover ordering, success, upload failure, failure-state
write failure, and post-upload finalization failure.

### Realtime/action race

Conversation reconciliation tracks persisted client IDs independently of
render state. If a Realtime insert arrives before the corresponding Server
Action rejects, the rejection cannot downgrade the persisted row or show a
false send error. The exact event-before-rejection race is covered.

### Fix-round verification

```text
pnpm install --frozen-lockfile
PASS

pnpm --filter @meld/web exec vitest run src/features/discovery
PASS: 7 files, 29 tests

pnpm test
PASS: Astryx tests, SQL static checks, and all workspace tests
      (web: 16 files, 67 tests)

pnpm typecheck
PASS

pnpm lint
PASS

pnpm check:astryx
PASS

pnpm check:sql-discovery
PASS: migration and 39-assertion pgTAP file parse as PostgreSQL;
      required security fragments present

pnpm build
PASS: Next.js 16.2.11 production build recognizes serverActions config

pnpm exec playwright test e2e/discovery-room.spec.ts
PASS: 1 test

pnpm exec playwright test
PASS: 2 tests

supabase test db supabase/tests/discovery_access.test.sql
NOT RUN: Supabase CLI remains unavailable
```

The first cold browser attempt exhausted the suite's 30-second timeout
during development compilation while the captured page already contained
the expected room. The unchanged standard-timeout rerun passed in 8.8
seconds, followed by the full suite passing. No test or timeout setting was
changed.

### Remaining verification limits

- Live migration application, pgTAP execution, RLS, Storage, and Realtime
  policy behavior remain unverified without Supabase CLI/PostgreSQL.
- A genuine encrypted-PDF fixture was not added because no PDF encryption
  utility is available in this environment. Deterministic `%PDF-` bytes with
  an `/Encrypt` dictionary and the parser error path remain unit-covered.
- `docs/product-feature-checklist.md` remains untouched and untracked.

## Fix Round 2

Colima made the local Supabase stack available, so the previously static-only
pgTAP suites were run against PostgreSQL for the first time.

### Installed pgTAP diagnosis

The live `extensions` schema was queried through `pg_proc` before changing
the tests:

- `has_policy` is not installed.
- `policy_cmd_is(name, name, name, text, text)` is installed and verifies
  both policy existence and command.
- `lives_ok` has only `(text)` and `(text, text)` overloads.
- `throws_ok(text, character, text, text)` supports the intended SQLSTATE,
  message, and description assertion.
- `is_empty(text, text)` executes a supplied query and asserts it returns no
  rows.

The initial live run reproduced the reported stopping points exactly:
Discovery stopped after 26/39, invitations after 22/35, and tenant isolation
after 6/14.

### Corrections

- `supabase/tests/discovery_access.test.sql` now uses `policy_cmd_is` for
  the Realtime `SELECT` and `INSERT` policies.
- `supabase/tests/invitations.test.sql` uses `throws_ok` for the expected
  active-invitation conflict instead of a nonexistent four-argument
  `lives_ok`.
- `supabase/tests/tenant_isolation.test.sql` uses `is_empty` with
  top-level `UPDATE ... RETURNING` queries for the three denied-update
  assertions. This preserves the security claim without nesting a
  data-modifying CTE inside an expression.

No migration or production implementation change was required. Planned
assertion counts remain accurate: 39 Discovery, 35 invitations, and 14
tenant-isolation assertions.

### Commands and exact results

```text
pnpm dlx supabase@2.110.0-beta.10 db reset
PASS: all four migrations applied; local containers restarted

pnpm dlx supabase@2.110.0-beta.10 test db
PASS: Files=3, Tests=88, Result: PASS

pnpm test:sql
PASS: 3 static-check tests; SQL function arities match;
      Discovery migration and pgTAP PostgreSQL grammar OK

git diff --check
PASS
```

The generated untracked `supabase/.temp/cli-latest` marker was removed.
`docs/product-feature-checklist.md` remains untouched and untracked.

## Fix Round 3

The room-local composite foreign keys introduced in Fix Round 1 used
`ON DELETE CASCADE`. PostgreSQL referential actions could therefore delete
artifact rows without evaluating the artifact creators' row-level delete
policies. A message author could indirectly remove another participant's
attachment, evidence, or decision. Cascading attachment metadata deletion
also left the corresponding private Storage object without a tracking row.

### Chosen deletion semantics

Task 5 does not require source deletion behavior, so artifact source
references now use the smallest safe behavior: explicit
`ON DELETE RESTRICT`.

- attachment to message: restricted;
- evidence to message: restricted;
- evidence to attachment: restricted;
- decision to source message: restricted.

Room-local `(id, room_id)` composite integrity remains enforced. Authorized
deletion of a referenced message or attachment now fails atomically with
`23503`; no child artifact or Storage tracking metadata is removed.
Mention-to-message deletion remains cascading because the mention insert
policy requires the source message's author to be the mention creator.

The static SQL checker requires exactly three restricted composite message
references and one restricted composite attachment reference.

### Live regression coverage

The Discovery pgTAP plan increased from 39 to 46 assertions. The test:

1. creates a participant-authored message;
2. creates an owner attachment, evidence item, decision, and private object
   referencing that source;
3. creates participant evidence referencing the owner's attachment;
4. proves the message author cannot cascade-delete the owner's artifacts;
5. proves the uploader cannot cascade-delete the participant's evidence;
6. verifies the message, artifacts, attachment metadata, evidence, and
   joined Storage-object/metadata tracking remain intact.

The RED run against the prior migration failed tests 13–18 and the later
duplicate-client assertion because the source message and dependent rows
were actually deleted. The private object remained while attachment
metadata disappeared, directly reproducing the untracked-object condition.

### Commands and exact results

```text
pnpm dlx supabase@2.110.0-beta.10 db reset
PASS: all four migrations applied; local containers restarted

pnpm dlx supabase@2.110.0-beta.10 test db
PASS: Files=3, Tests=95, Result: PASS
      Discovery 46, invitations 35, tenant isolation 14

pnpm test:sql
PASS: 3 static-check tests; SQL arities match;
      Discovery migration and pgTAP grammar/count guards pass

pnpm --filter @meld/web exec vitest run \
  src/features/discovery/repository.test.ts \
  src/features/discovery/upload-persistence.test.ts
PASS: 2 files, 10 tests

git diff --check
PASS
```

Files changed in this round:

- `supabase/migrations/202607240004_discovery.sql`
- `supabase/tests/discovery_access.test.sql`
- `scripts/check-discovery-sql.mjs`
- `docs/design/reports/2026-07-24-task-5-realtime-discovery-rooms.md`

The generated `supabase/.temp/cli-latest` marker was removed.
`docs/product-feature-checklist.md` remains untouched and untracked.
