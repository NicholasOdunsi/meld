# Task 10 Report — E2E: full ask → confirm → generate → view

## Status

DONE (commit `d8dd04b`). Verified on Node 20.19.0.

Task 10 is the plan's final task: one Playwright spec that walks the whole
room-owner flow across every real boundary at once (RSC page, the "use client"
Conversation + RoomTaskStatusProvider, the server action, and the polling
projection), plus the fake-path changes that make that flow reachable offline.

## What it proves

`e2e/prd-generate.spec.ts` (created):

1. Create a fresh Discovery Room via onboarding — it starts with **no PRD**, so
   no PRD tab is present.
2. Ask the Product Agent to "make a PRD" (Codex). The settled reply carries
   `proposedAction: { kind: "prd_generate" }`, surfacing the **Generate PRD**
   confirm chip.
3. Confirm. The **PRD tab appears** from the optimistic queue notice.
4. Open the PRD tab: the **"Drafting your PRD…"** generating state shows, then
   the **materialized document** ("Checkout redesign" / "Executive summary")
   replaces it.

TDD: written first, run RED (the fake reply carried no `proposedAction`, so the
Generate PRD button never appeared), then GREEN after the fake changes.

## Fake-path changes (Step 1)

- `discovery/e2e-fake.ts`
  - The in-memory store now holds `prds` (seeded with one PRD for the
    pre-existing E2E room so `prd-view.spec` keeps a document to open) and
    `pendingPrdGenerations`.
  - `buildFakePrd(roomId)` is the deterministic document (title + section labels
    are the assertion surface).
  - A reply whose source message mentions a PRD (`/\bprd\b/i`) settles with
    `proposedAction: { kind: "prd_generate" }`; every other prompt still settles
    to the plain challenge, so `product-agent-room-reply.spec` is unaffected.
  - `fakeQueuePrdGeneration` records a queued `prd_generate` task + pending
    generation; `fakeListRoomTaskStatuses` advances it queued → running →
    completed and materializes exactly one PRD on completion.
  - `fakeRoomHasPrd` / `fakeGetRoomPrd` expose the store to the read path;
    `fakeDeleteRoom` cleans up the new PRD state.
- `prd/e2e-fake.ts`: `fakeGeneratePrd` delegates to `fakeQueuePrdGeneration`
  (was a bare `randomUUID` stub reserved for Task 10).
- `discovery/fake-backend.ts`: `hasPrd` and `getRoomPrd` read the store instead
  of the hardcoded `roomId === E2E_DISCOVERY_ROOM_ID`; the inline `SEEDED_PRD`
  const moved into the store builder.

## Debugging notes (systematic-debugging)

- First RED failed on `getByRole("link", { name: /^PRD/ })` matching **2**
  elements: the org was named "PRD Labs", so the org-name link matched `/^PRD/`.
  Renamed the org to "Checkout Labs".
- The fake generation originally completed in one poll. Whichever
  RoomTaskStatusProvider was mounted could then observe the task **already
  terminal** and never fire the one `router.refresh()` that swaps in the
  document, leaving the PRD tab stuck on the "No PRD yet" empty state. Fixed by
  keeping the fake generation `running` for a few polls (`ticks < 2`), mirroring
  real 30–60s generation, so the mounted provider registers it active and
  refreshes on completion. This is a fake-timing fix, not a product change.
- Observation for final review (not fixed here — pre-existing, out of Task 10's
  E2E scope): after confirming, `handleGeneratePrd`'s `router.push(?tab=prd)` did
  not switch the URL in the E2E; the tab still appears and clicking it (the
  plan's own snippet clicks the tab) navigates correctly. Worth a look during the
  whole-branch review in case the auto-switch is genuinely inert in production.

## Verification (Node 20.19.0)

- Playwright: `prd-generate.spec.ts` + `prd-view.spec.ts` +
  `product-agent-room-reply.spec.ts` — **6/6** (no regression from the reply and
  read-path changes).
- `pnpm --filter web test` — 517; `@meld/contracts` — 51; `connector` — 399.
- `pnpm typecheck`, `pnpm lint`, `pnpm check:astryx apps/web/src`,
  `pnpm build` — all green.
- pgTAP: `create_prd_generate_task` 20/20, `ai_task_transitions` 240/240,
  `message_proposed_action` green. `prds.test.sql` fails 4/12 with count
  mismatches ("have: 3, want: 2") — the documented populated-local-DB artifact
  (the dev DB holds 1 pre-existing PRD row); Task 10 changed no SQL and the
  in-memory fake never writes Postgres. Not a regression.

## Unrelated fix carried on the branch

`scripts/conductor-workspace.test.mjs` had pre-existing `no-useless-escape`
errors (`\"` inside regex literals) from the branch base (`022662a`) that were
failing the shared `pnpm lint`. Fixed in its own commit (`30a3b5c`) to unblock
the gate; flag for review since it is outside the PRD work.

## Commit

- `d8dd04b` — `test(prd): e2e for the natural-language generate-and-view flow`
