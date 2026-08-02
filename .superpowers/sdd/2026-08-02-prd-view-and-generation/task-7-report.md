# Task 7 Report — proposedAction contract, persistence, and discovery mapping

## Status

DONE

Task 7 is implemented, verified, self-reviewed, and committed. No blocking
concerns remain.

## Summary

Room replies may now carry an optional nullable proposedAction whose only
contract-valid kind is prd_generate. Settlement stores the action only when the
raw value is a JSON object with kind exactly prd_generate; missing, JSON null,
unknown-kind, and malformed values all persist SQL NULL. Discovery query,
Realtime, optimistic, and fake message paths now expose a consistently typed
proposedAction field.

## Files changed

- packages/contracts/src/ai.ts — extends RoomReplyResultSchema.
- packages/contracts/src/ai.test.ts — covers absent, null, valid, and unknown
  proposal contract behavior.
- supabase/migrations/202608020005_message_proposed_action.sql — adds the nullable
  jsonb column and recreates the canonical settlement function with only the
  enumerated proposal changes.
- supabase/tests/message_proposed_action.test.sql — transaction-safe pgTAP for
  valid, absent, null, unknown, and malformed settlement values.
- apps/web/src/features/discovery/repository.ts — selects, types, and maps the
  database value onto DiscoveryMessage.
- apps/web/src/features/discovery/repository.test.ts — covers initial query,
  Realtime, list, and back-compat null mapping.
- apps/web/src/features/discovery/e2e-fake.ts — defaults human and Product Agent
  fake messages to null.
- apps/web/src/features/discovery/components/conversation.tsx — defaults the
  optimistic human message to null.
- apps/web/src/features/discovery/components/conversation.test.tsx — updates the
  shared typed message fixture.
- .superpowers/sdd/2026-08-02-prd-view-and-generation/task-7-report.md — this
  report.

## Canonical settlement provenance

Before implementation:

- A repository-wide definition search found exactly one create-or-replace
  definition: supabase/migrations/202607290002_room_agent_messages.sql:638.
- The live schema ledger ended at 202608020004.
- pg_get_functiondef for the live eight-argument settle_ai_task returned the
  same 298-line body and no later migration redefined it.
- The new migration copied lines 638-956, including the complete function and
  revoke/grant statements.

The hot-path validation command removed only the added proposal declaration,
extraction block, insert column, and insert value, then diffed the result
against the canonical source:

~~~text
diff -u \
  <(sed -n '638,956p' supabase/migrations/202607290002_room_agent_messages.sql) \
  <(sed -n '/^create or replace function public.settle_ai_task(/,/^) to service_role;$/p' supabase/migrations/202608020005_message_proposed_action.sql | sed \
    -e '/^  reply_proposed_action jsonb;$/d' \
    -e '/^      reply_proposed_action := case$/,/^      end;$/d' \
    -e '/^      proposed_action$/d' \
    -e 's/^      suggested_next_questions,$/      suggested_next_questions/' \
    -e '/^      reply_proposed_action$/d' \
    -e 's/^      reply_suggested_next_questions,$/      reply_suggested_next_questions/')
Exit 0
(no output)
~~~

This proves the lock order, canonical fingerprint, settled replay/conflict
logic, staleness fence, status/error mapping, citation-subset validation,
partial/failure behavior, task/attempt writes, idempotent insert, ACLs, and
search_path remained byte-for-byte unchanged outside the enumerated additions.

## RED evidence

All Node commands used exactly Node 20.19.0:

~~~text
PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH" node --version
v20.19.0
~~~

Contract RED command:

~~~text
PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH" pnpm --filter @meld/contracts exec vitest run src/ai.test.ts
Exit 1
Test Files  1 failed (1)
Tests       2 failed | 1 passed (3)
~~~

Exact intended failures:

~~~text
accepts a prd_generate proposal
AssertionError: expected undefined to be 'prd_generate'

rejects an unknown action kind
AssertionError: expected [Function] to throw an error
~~~

Settlement RED command:

~~~text
docker exec -i supabase_db_meld psql -U postgres -d postgres -f - < supabase/tests/message_proposed_action.test.sql
~~~

Exact failure signal:

~~~text
psql:<stdin>:120: ERROR:  column "proposed_action" does not exist
LINE 3:     select proposed_action ->> 'kind'
                   ^
ROLLBACK
~~~

The command exited zero because plain psql does not stop on SQL errors by
default; the database error is the RED result. The final ROLLBACK preserved all
fixture and demo data.

## Migration apply

~~~text
PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH" pnpm exec supabase migration up --local
Connecting to local database...
Applying migration 202608020005_message_proposed_action.sql...
{"applied":["/Users/macbookair2020/conductor/workspaces/Meld/calgary/supabase/migrations/202608020005_message_proposed_action.sql"],"message":"Migrations applied"}
Exit 0
~~~

A subsequent migration list reported local and remote both at 202608020005.

## GREEN evidence

Focused contract:

~~~text
PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH" pnpm --filter @meld/contracts exec vitest run src/ai.test.ts
Exit 0
Test Files  1 passed (1)
Tests       4 passed (4)
~~~

Focused transactional settlement command:

~~~text
docker exec -i supabase_db_meld psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < supabase/tests/message_proposed_action.test.sql
~~~

Filtered exact TAP output:

~~~text
1..5
ok 1 - a validated prd_generate proposal persists on the Product Agent message
ok 2 - an absent proposed action persists no actionable data
ok 3 - a null proposed action persists no actionable data
ok 4 - an unknown proposed action persists no actionable data
ok 5 - a malformed proposed action persists no actionable data
~~~

Full settlement regression used the established transaction-scoped truncate
prepend. The test file begins with BEGIN and ends with ROLLBACK, so both the
truncate and all fixtures roll back together:

~~~text
awk 'NR == 1 { print; print "truncate table auth.users cascade;"; next } { print }' supabase/tests/ai_task_transitions.test.sql | docker exec -i supabase_db_meld psql -v ON_ERROR_STOP=1 -qAt -U postgres -d postgres -f -
Exit 0
~~~

Exact TAP output:

~~~text
1..240
ok 1 - a provider connection user cannot disagree with its device owner
ok 2 - a task initiating user cannot disagree with its device owner
ok 3 - the table constraint rejects whitespace-only instructions
ok 4 - an owner can create a task for an active connected device
ok 5 - creation returns camel-case-compatible columns and a trimmed instruction
ok 6 - another user's device is rejected
ok 7 - a revoked device is rejected
ok 8 - a missing provider connection is rejected
ok 9 - a non-participant room is rejected
ok 10 - an overlong instruction is rejected
ok 11 - the task creation RPC rejects whitespace-only instructions
ok 12 - 501 manifest messages are rejected
ok 13 - 51 manifest attachments are rejected
ok 14 - 101 manifest evidence records are rejected
ok 15 - 101 manifest decisions are rejected
ok 16 - a manifest above 256 KiB is rejected
ok 17 - duplicate message IDs are rejected
ok 18 - duplicate attachment IDs are rejected
ok 19 - duplicate evidence IDs are rejected
ok 20 - duplicate decision IDs are rejected
ok 21 - a cross-room message is rejected
ok 22 - a cross-room attachment is rejected
ok 23 - cross-room evidence is rejected
ok 24 - a cross-room decision is rejected
ok 25 - authenticated cannot execute the internal lease function
ok 26 - authenticated cannot execute the internal transition function
ok 27 - a task organization cannot disagree with its room
ok 28 - an attempt device cannot disagree with its task device
ok 29 - an event task cannot disagree with its attempt task
ok 30 - the partial unique index permits only one current attempt
ok 31 - queued task can wait for its device
ok 32 - task cannot skip execution
ok 33 - queued task can become ready
ok 34 - waiting task can become ready
ok 35 - ready task can run
ok 36 - ready task can return to waiting
ok 37 - running task can complete
ok 38 - running task can need review
ok 39 - running task can need reauthentication
ok 40 - running task can reach a usage limit
ok 41 - running task can return to waiting
ok 42 - reauthenticated task can become ready
ok 43 - usage-limited task can become ready
ok 44 - reviewed task can complete
ok 45 - reviewed task can retry
ok 46 - completed tasks reject transitions
ok 47 - cancelled tasks reject transitions
ok 48 - failed tasks reject transitions
ok 49 - every non-terminal state can transition to cancelled
ok 50 - every non-terminal state can transition to failed
ok 51 - the initiating user can cancel a queued task
ok 52 - another user cannot cancel a task
ok 53 - the initiating user can cancel a running task
ok 54 - cancellation stamps the task cancelled
ok 55 - running cancellation settles the current attempt and requests delivery
ok 56 - running cancellation stores a SHA-256 settlement fingerprint
ok 57 - retry works from needs_reauthentication
ok 58 - retry works from usage_limit_reached
ok 59 - retry works from needs_review
ok 60 - accept works from needs_review
ok 61 - discard works from needs_review
ok 62 - retry is rejected from queued
ok 63 - accept is rejected outside needs_review
ok 64 - discard is rejected outside needs_review
ok 65 - terminal tasks reject resolution
ok 66 - another user cannot resolve a task
ok 67 - RLS exposes only the caller's devices
ok 68 - RLS exposes only the caller's provider connections
ok 69 - a room participant can read their room task
ok 70 - a non-participant cannot read another room's tasks
ok 71 - authenticated cannot write gateway-owned tables directly
ok 72 - service_role cannot write task tables directly
ok 73 - service_role cannot execute authenticated-only task RPCs
ok 74 - authenticated has only SELECT on execution_devices
ok 75 - authenticated has only SELECT on provider_connections
ok 76 - authenticated has only SELECT on ai_tasks
ok 77 - authenticated has only SELECT on ai_task_attempts
ok 78 - authenticated has only SELECT on ai_task_events
ok 79 - service_role has only SELECT on execution_devices
ok 80 - service_role has only SELECT on provider_connections
ok 81 - service_role has only SELECT on ai_tasks
ok 82 - service_role has only SELECT on ai_task_attempts
ok 83 - service_role has only SELECT on ai_task_events
ok 84 - a ready task can be claimed by its assigned device
ok 85 - claim returns identifiers and instruction without context
ok 86 - claim transitions to running with attempt one and a future lease
ok 87 - only one of two claims obtains the payload candidate
ok 88 - the wrong device cannot claim a task
ok 89 - a task with a settled prior attempt can be claimed again
ok 90 - claim increments the prior maximum attempt number
ok 91 - a new event cannot skip sequence one
ok 92 - the first event appends at sequence one
ok 93 - event append acknowledges sequence one
ok 94 - a newly appended event renews its attempt lease
ok 95 - an exact event replay is acknowledged
ok 96 - an exact event replay does not insert a duplicate
ok 97 - an event replay with a different type conflicts
ok 98 - an event replay with a different payload conflicts
ok 99 - another device cannot append an event
ok 100 - an expired attempt cannot append an event
ok 101 - a cancelled task cannot append an event
ok 102 - lease renewal ignores stale and absent pairs
ok 103 - lease renewal returns only the matching unexpired attempt
ok 104 - one-microsecond-expired leases cannot be renewed before reaping
ok 105 - lease renewal rejects more than 32 active attempts
ok 106 - a valid completion settles the attempt
ok 107 - malformed output settles to needs review
ok 108 - authentication failure settles to needs reauthentication
ok 109 - usage failure settles to usage limit reached
ok 110 - completion records the result and clears error fields
ok 111 - review settlement records canonical partial result and error fields
ok 112 - authentication_required maps to needs_reauthentication
ok 113 - usage_limit_reached maps to its resumable status
ok 114 - an identical completed settlement replays
ok 115 - an identical needs-review settlement replays
ok 116 - an identical reauthentication settlement replays
ok 117 - an identical usage-limit settlement replays
ok 118 - completed replay returns the recorded status
ok 119 - needs-review replay returns the recorded status
ok 120 - reauthentication replay returns the recorded status
ok 121 - usage-limit replay returns the recorded status
ok 122 - a completed replay with different canonical content conflicts
ok 123 - a needs-review replay with different canonical content conflicts
ok 124 - a reauthentication replay with a different operation conflicts
ok 125 - a usage-limit replay with different canonical content conflicts
ok 126 - a settled attempt cannot append an event
ok 127 - the assigned device can acknowledge a requested cancellation
ok 128 - cancellation acknowledgement stamps the settled attempt
ok 129 - cancellation acknowledgement is idempotent
ok 130 - an idempotent cancellation acknowledgement preserves its first timestamp
ok 131 - another device cannot acknowledge cancellation
ok 132 - a non-cancellation settlement cannot acknowledge cancellation
ok 133 - expired unsettled attempts are reaped
ok 134 - a no-event expiry is observable as waiting_for_device
ok 135 - an eventful expiry is observable as needs_review
ok 136 - a no-event expiry returns the task to waiting_for_device
ok 137 - an eventful expiry records needs_review and execution_abandoned
ok 138 - reaping settles the no-event attempt
ok 139 - reaping settles the eventful attempt
ok 140 - a reaped stale attempt cannot complete
ok 141 - service_role can execute every Task 3 gateway RPC
ok 142 - authenticated cannot execute Task 3 gateway RPCs
ok 143 - the gateway reads the canonical 90-second lease
ok 144 - device authentication lookup exposes only its four required fields
ok 145 - device authentication lookup is read-only
ok 146 - device authentication lookup returns no row for an unknown device
ok 147 - an active non-revoked device can record a connection
ok 148 - connection recording changes only last-seen and capped connector version
ok 149 - connector versions are capped at 100 characters
ok 150 - a revoked device reports its status instead of raising
ok 151 - a revoked device advances neither last-seen nor connector version
ok 152 - a device that does not exist still raises
ok 153 - provider enum strings are validated before any write
ok 154 - provider updates reject non-array JSON with a controlled error
ok 155 - invalid provider input leaves every connection unchanged
ok 156 - provider updates accept at most two records
ok 157 - two validated provider records can be upserted
ok 158 - provider upsert derives device ownership and stores only validated fields
ok 159 - provider payload paths and raw responses have no persistence columns
ok 160 - the manifest task is claimed before hydration
ok 161 - the current claimed attempt can hydrate authorized room context
ok 162 - hydration emits a ready outcome with the exact camel-case package sections
ok 163 - hydration emits only the named message with author display fallback
ok 164 - hydration emits the named ready attachment and caption
ok 165 - hydration emits named evidence and decisions
ok 166 - hydration never exposes attachment storage paths
ok 167 - dispatch refresh accepts and deduplicates connected device IDs
ok 168 - dispatch refresh applies all four connection-state transitions
ok 169 - dispatch returns only connected ready tasks as available
ok 170 - dispatch returns only unacknowledged cancellations inside 24 hours
ok 171 - dispatch refresh is repeatable
ok 172 - existing ready tasks are returned on every sweep
ok 173 - pending cancellation delivery repeats until acknowledged
ok 174 - the pending Task 4 cancellation can be acknowledged
ok 175 - dispatch refresh continues after cancellation acknowledgement
ok 176 - an acknowledged cancellation is no longer dispatched
ok 177 - the access-recheck task is claimed before participation changes
ok 178 - the oversized-context task is claimed before hydration
ok 179 - hydration reports permission rejection after room access is revoked
ok 180 - revoked hydration settles the task as permission_changed
ok 181 - hydration reports size rejection without emitting a context package
ok 182 - oversized hydration settles the task with unknown
ok 183 - a null connected-device list is treated as empty
ok 184 - an empty dispatch sweep demotes ready tasks and returns no announcements
ok 185 - a revoked connected ID cannot cause task dispatch
ok 186 - dispatch keeps a revoked device task waiting
ok 187 - a revoked device cannot claim a task
ok 188 - a revoked device cannot publish provider status
ok 189 - a revoked device cannot hydrate and run a claimed task
ok 190 - a revoked device cannot append task events
ok 191 - the rejected revoked-device event inserted no row
ok 192 - a revoked device renews no task leases
ok 193 - revoked-device renewal leaves the lease deadline unchanged
ok 194 - a revoked device cannot settle a task
ok 195 - rejected revoked-device settlement leaves task state unchanged
ok 196 - revoked event, renewal, and settlement leave the whole task row unchanged
ok 197 - revoked event, renewal, and settlement leave the whole attempt unchanged
ok 198 - authenticated cannot insert execution_devices
ok 199 - authenticated cannot update execution_devices
ok 200 - authenticated cannot delete execution_devices
ok 201 - authenticated cannot insert provider_connections
ok 202 - authenticated cannot update provider_connections
ok 203 - authenticated cannot delete provider_connections
ok 204 - authenticated cannot insert ai_tasks
ok 205 - authenticated cannot update ai_tasks
ok 206 - authenticated cannot delete ai_tasks
ok 207 - authenticated cannot insert ai_task_attempts
ok 208 - authenticated cannot update ai_task_attempts
ok 209 - authenticated cannot delete ai_task_attempts
ok 210 - authenticated cannot insert ai_task_events
ok 211 - authenticated cannot update ai_task_events
ok 212 - authenticated cannot delete ai_task_events
ok 213 - service_role cannot insert execution_devices
ok 214 - service_role cannot update execution_devices
ok 215 - service_role cannot delete execution_devices
ok 216 - service_role cannot insert provider_connections
ok 217 - service_role cannot update provider_connections
ok 218 - service_role cannot delete provider_connections
ok 219 - service_role cannot insert ai_tasks
ok 220 - service_role cannot update ai_tasks
ok 221 - service_role cannot delete ai_tasks
ok 222 - service_role cannot insert ai_task_attempts
ok 223 - service_role cannot update ai_task_attempts
ok 224 - service_role cannot delete ai_task_attempts
ok 225 - service_role cannot insert ai_task_events
ok 226 - service_role cannot update ai_task_events
ok 227 - service_role cannot delete ai_task_events
ok 228 - PUBLIC cannot execute any AI task RPC
ok 229 - service_role can execute every Task 4 gateway RPC
ok 230 - authenticated cannot execute Task 4 gateway RPCs
ok 231 - authenticated-only AI task RPCs remain isolated from service_role
ok 232 - append locks device, task, and attempt in canonical order
ok 233 - settlement locks device, task, and attempt in canonical order
ok 234 - cancellation acknowledgement locks device, task, and attempt in canonical order
ok 235 - hydration resolves its device then locks device, task, and attempt in order
ok 236 - lease renewal locks ordered tasks then ordered attempts after the device
ok 237 - claim locks device then task and calculates attempt numbers in order
ok 238 - dispatch locks UUID-ordered devices before UUID-ordered tasks
ok 239 - connection recording updates only the same locked active device row
ok 240 - revocation updates the same device row it locked
~~~

The room-reply settlement regression was run with the same isolated prepend:

~~~text
awk 'NR == 1 { print; print "truncate table auth.users cascade;"; next } { print }' supabase/tests/room_agent_messages.test.sql | docker exec -i supabase_db_meld psql -v ON_ERROR_STOP=1 -qAt -U postgres -d postgres -f -
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
~~~

All 49 assertions emitted ok and no not-ok line.

Contract suite:

~~~text
PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH" pnpm --filter @meld/contracts exec vitest run
Exit 0
Test Files  2 passed (2)
Tests       49 passed (49)
~~~

Focused Discovery mapping and conversation suite:

~~~text
PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH" pnpm --filter @meld/web exec vitest run src/features/discovery/repository.test.ts src/features/discovery/components/conversation.test.tsx
Exit 0
Test Files  2 passed (2)
Tests       46 passed (46)
~~~

The run emitted only pre-existing @boxicons/react missing-source sourcemap
warnings; no test warning or failure.

Web typecheck:

~~~text
PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH" pnpm --filter @meld/web typecheck
> @meld/web@0.1.0 typecheck
> tsc --noEmit
Exit 0
~~~

SQL static suite:

~~~text
PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH" pnpm test:sql
Exit 0
contract enum parity: SQL and @meld/contracts values match exactly
repository function definitions and calls use declared arities: ok
public.settle_ai_task: 35 occurrences use 8 arguments
SQL discovery grammar checks: all OK
~~~

Touched-file lint and whitespace:

~~~text
PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH" pnpm --filter @meld/contracts exec eslint src/ai.ts src/ai.test.ts
PATH="$HOME/.nvm/versions/node/v20.19.0/bin:$PATH" pnpm --filter @meld/web exec eslint src/features/discovery/repository.ts src/features/discovery/repository.test.ts src/features/discovery/e2e-fake.ts src/features/discovery/components/conversation.tsx src/features/discovery/components/conversation.test.tsx
git diff --check
Exit 0
(no output)
~~~

## Database preservation and security metadata

Counts immediately before and after the transaction-isolated 240-test
regression were identical:

~~~json
{"prds": 1, "users": 1, "messages": 0, "organizations": 2}
~~~

Column metadata:

~~~json
{"type": "jsonb", "default": null, "nullable": "YES"}
~~~

Settlement security metadata after migration:

~~~json
{"config": ["search_path=\"\""], "anon_execute": false, "public_execute": false, "security_definer": true, "service_role_execute": true, "authenticated_execute": false}
~~~

The 240-test suite additionally reconfirmed canonical device-task-attempt lock
order (assertion 233) and service-role/authenticated gateway ACL boundaries
(assertions 141-142).

## Self-review

- Contract compatibility: missing and explicit null proposals parse; only
  prd_generate is accepted; unknown kinds reject.
- Settlement validation: jsonb_typeof must be object and kind must equal
  prd_generate before any value is copied. Invalid proposal data does not make
  the otherwise-valid room reply fail; it becomes SQL NULL.
- Failure/partial safety: the existing reply_valid and complete-only insert
  guards are untouched, so failure, partial, and malformed room replies still
  post no Product Agent message.
- Discovery parity: initial PostgREST selection, raw Realtime mapping,
  repository list mapping, optimistic human messages, and both fake message
  constructors all define the new field.
- No helper extraction, RLS rewrite, constraint expansion, or unrelated
  refactor was introduced.
- git diff --check and the normalized hot-path diff are clean.

## Commit hashes

- dde9af0ac22848dcd79bf51a0db2dd3511e43cdb —
  feat(prd): persist proposed room reply actions

The report is committed separately after the implementation commit so it can
record the implementation hash.

## Concerns

None. The local database was intentionally advanced to migration 202608020005;
all transaction-scoped fixture cleanup rolled back, and recorded demo counts
were unchanged.
