# Task 6 Report — `create_prd_generate_task` RPC

## Status

DONE_WITH_CONCERNS

The Task 6 implementation and focused coverage are complete and green. One
unrelated existing PRD-suite fixture-isolation concern is recorded below; no
demo data was modified or removed.

## Summary

Added the authenticated `public.create_prd_generate_task(uuid, ai_provider)`
security-definer RPC. It authorizes room participants, resolves the caller's
saved device and provider using the current `create_room_reply_task` pattern,
requires an active non-revoked device and a ready provider connection, freezes
the room context manifest server-side, and queues a `prd_generate` task with the
fixed instruction required by the brief.

Added a transaction-wrapped pgTAP test covering the ready participant success
path, persisted task kind, and uniform `P0001` rejection for an organization
member who is not a room participant.

## Exact files changed

- `supabase/migrations/202608020004_create_prd_generate_task.sql` — creates the
  participant-authorized RPC and least-privilege grants.
- `supabase/tests/create_prd_generate_task.test.sql` — seeds the current runnable
  device/provider preference shape and exercises the three required behaviors.
- `.superpowers/sdd/2026-08-02-prd-view-and-generation/task-6-report.md` — this
  report.

## RED evidence

Command:

```text
docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/tests/create_prd_generate_task.test.sql
```

Exit code and exact TAP failure output:

```text
Exit 0
plan: 1..3
not ok 1 - participant with a ready device can start PRD generation
# Failed test 1: "participant with a ready device can start PRD generation"
#     died: 42883: function public.create_prd_generate_task(unknown) does not exist
#         HINT:       No function matches the given name and argument types. You might need to add explicit type casts.
#         CONTEXT:
#             PL/pgSQL function lives_ok(text,text) line 14 at EXECUTE
not ok 2 - creates a prd_generate task
# Failed test 2: "creates a prd_generate task"
#         have: NULL
#         want: prd_generate
not ok 3 - non-participant cannot start PRD generation
# Failed test 3: "non-participant cannot start PRD generation"
#       caught: 42883: function public.create_prd_generate_task(unknown) does not exist
#       wanted: P0001
# Looks like you failed 3 tests of 3
ROLLBACK
```

`psql` exits zero for pgTAP assertion failures; the TAP output above is the RED
signal. The final `ROLLBACK` confirms the seed data was not persisted.

## Local migration registration and apply

Commands and exact outputs:

```text
docker exec -i supabase_db_meld psql -U postgres -d postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('202608020004','create_prd_generate_task') on conflict do nothing;"
INSERT 0 1
Exit 0
```

```text
docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/migrations/202608020004_create_prd_generate_task.sql
CREATE FUNCTION
REVOKE
REVOKE
GRANT
Exit 0
```

Registration verification returned:

```text
version      | name
202608020004 | create_prd_generate_task
```

## GREEN evidence

Command:

```text
docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/tests/create_prd_generate_task.test.sql
```

Exact TAP result:

```text
Exit 0
1..3
ok 1 - participant with a ready device can start PRD generation
ok 2 - creates a prd_generate task
ok 3 - non-participant cannot start PRD generation
finish: (0 rows)
ROLLBACK
```

The final `ROLLBACK` confirms the green test also preserved unrelated local
database state.

## Regression and static verification

Current room-reply device/provider and authorization regression suite:

```text
docker exec -i supabase_db_meld psql -v ON_ERROR_STOP=1 -qAt -U postgres -d postgres -f - < supabase/tests/room_agent_messages.test.sql
Exit 0
1..49
ok 1 - ai_tasks.source_message_id exists
ok 2 - messages.author_type exists
ok 3 - messages.ai_task_id exists
ok 4 - Function public.create_room_reply_task(uuid, ai_provider) should exist
ok 5 - Function public.list_room_ai_task_statuses(uuid) should exist
ok 6 - Index ai_tasks_one_room_reply_per_source should exist
ok 7 - a human message without an author is rejected
ok 8 - a human message with AI provenance is rejected
ok 9 - a Product Agent message without an initiator is rejected
ok 10 - a Product Agent message without a provider is rejected
ok 11 - a Product Agent message without an AI task is rejected
ok 12 - a well-formed Product Agent message is accepted
ok 13 - Product Agent assumptions and suggested questions persist on the message
ok 14 - more than twenty assumptions are rejected
ok 15 - more than five suggested questions are rejected
ok 16 - an assumption longer than 2,000 characters is rejected
ok 17 - an owner can create a room-reply task bound to their message
ok 18 - the created task binds the source message and resolves the saved default
ok 19 - one source message creates at most one room-reply task
ok 20 - a repeated request for the same source message returns the existing task
ok 21 - the repeated request did not queue a second task
ok 22 - a message the caller does not own is rejected
ok 23 - an unknown source message is rejected
ok 24 - ordinary task creation still works for later task kinds
ok 25 - create_ai_task refuses room_reply so a mention must bind its source message
ok 26 - a human participant can still post an ordinary message
ok 27 - authenticated users cannot directly insert Product Agent messages
ok 28 - a second room-reply task for one source message is refused by the index
ok 29 - a valid completed room reply settles to completed
ok 30 - a valid completed room reply inserts one Product Agent message
ok 31 - the inserted message carries the settled task provenance
ok 32 - the validated citations, assumptions and questions persist
ok 33 - a duplicate identical completion returns the terminal status
ok 34 - the duplicate completion did not insert a second message
ok 35 - a conflicting completion is rejected
ok 36 - a partial room reply settles terminally to needs_review without raising
ok 37 - a partial result inserts no Product Agent message
ok 38 - a malformed completion with no response settles terminally to needs_review
ok 39 - a malformed completion inserts no Product Agent message
ok 40 - replaying the same malformed completion is idempotent
ok 41 - the malformed replay still inserts no Product Agent message
ok 42 - a conflicting later settlement of a malformed reply is still rejected
ok 43 - a citation outside the frozen manifest settles terminally to needs_review
ok 44 - an out-of-manifest citation inserts no Product Agent message
ok 45 - a failed room reply settles without completing
ok 46 - a failed room reply inserts no Product Agent message
ok 47 - a room participant can read safe task status
ok 48 - the projection lists every room task through its safe columns only
ok 49 - a non-participant sees no room task status
```

Whitespace/static check before the implementation commit:

```text
git diff --check
Exit 0
(no output)
```

No Node tooling was involved in this SQL-only task, so the Node 20.19.0
requirement was not applicable.

## Security verification and self-review

Database metadata query result:

```text
prosecdef | proconfig           | proacl
t         | {"search_path=\"\""} | {postgres=X/postgres,authenticated=X/postgres}

anon_execute | authenticated_execute | service_role_execute
f            | t                     | f
```

- The function is `security definer` and retains `set search_path = ''`.
- Every referenced relation/type/function is schema-qualified, including
  `auth.uid()` and all `public` objects.
- A missing caller, missing room, and non-participant all receive the same
  application error code/message (`P0001`, `invalid_prd_generate_request`).
- Participant authorization occurs before saved-preference or connection
  resolution, so an unauthorized caller cannot queue work against a room.
- The saved preference is selected only for `caller_id`; device ownership,
  active status, and `revoked_at is null` are rechecked server-side.
- The provider connection must match caller, device, and resolved provider and
  be installed, authenticated, and supported.
- The manifest is derived only from the authorized target room. Attachment
  inclusion retains the current message-linked and non-discarded restrictions.
- The task kind, queued status, instruction, manifest, and revision are fixed
  server-side; callers can override only the provider, which still must have a
  ready connection on the saved device.
- Default/public execution was revoked explicitly. Only `authenticated` has
  EXECUTE; `anon` and `service_role` do not.
- The returned camelCase projection omits the frozen manifest, instruction,
  result, and error details.
- The test begins a transaction and finishes with `rollback`, including on the
  successful task-insert path.

## Commit hashes

- `13d561bb9730ca11bc0b42ccf7d22990a4d8a831` —
  `feat(db): create_prd_generate_task RPC mirroring room-reply device resolution`

The report is committed separately after the implementation commit so it can
record the implementation hash.

## Concerns

The unrelated command below was run as a proportional PRD regression check:

```text
docker exec -i supabase_db_meld psql -v ON_ERROR_STOP=1 -qAt -U postgres -d postgres -f - < supabase/tests/prds.test.sql
```

It exited zero at the `psql` process level but pgTAP reported four failures:

```text
1..12
not ok 1 - no prd before task completes
# Failed test 1: "no prd before task completes"
#         have: 1
#         want: 0
not ok 2 - trigger inserts one prd on completion
# Failed test 2: "trigger inserts one prd on completion"
#         have: 2
#         want: 1
ok 3 - first prd is version 1
ok 4 - prd status is draft
ok 5 - document payload stored
not ok 6 - owner is room owner
# Failed test 6: "owner is room owner"
#         have: e38906b3-2747-428b-87b0-45bc9dc8161e
#         want: 10000000-0000-4000-8000-000000000001
ok 7 - second completion is version 2
ok 8 - a completed task with no payload key does not raise
not ok 9 - a missing payload key materializes no additional prd
# Failed test 9: "a missing payload key materializes no additional prd"
#         have: 3
#         want: 2
ok 10 - room participant sees both prds
ok 11 - outsider sees no prds
ok 12 - authenticated cannot write prds directly
# Looks like you failed 4 tests of 12
```

This suite uses unscoped whole-table counts and `limit 1`, so the pre-existing
demo PRD in the local database is included in its assertions. The failures are
not caused by Task 6, and the suite's outer transaction rolled back all of its
own fixture changes. The demo row and all other unrelated local state were
preserved. The Task 6 test scopes its task assertion by the seeded room and is
transaction-wrapped, so it remains isolated and green in the same database.
