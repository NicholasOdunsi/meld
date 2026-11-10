# Taste composer QA (Plan 3 Task 10)

Date: 2026-11-10
Branch: `docs/native-taste-spec`

## Real-data walkthrough

**Skipped:** `DEEPSEEK_API_KEY` is not set in this workspace, so the live
interpreter path could not be exercised (PDF + public link + “calm but
expensive, never use gradients”, Keep / Remove / reject memory, blocked
`http://127.0.0.1` link).

Re-run once a key is available in the real (non-demo) app:

1. Drop a short brand PDF + paste one public link + type the phrase above → **Read it**.
2. Check source lines (PDF page, link host, quoted words); gradients → `avoid`.
3. Hover preview in the sample; **Keep** updates board + chapter; **Remove** on an
   `add` card lands on **You avoid**.
4. Second Read of the same file must not re-propose a rejected card.
5. Private link `http://127.0.0.1` → “That link is blocked”; other inputs still read.

## Automated verification (this run)

All green:

- `pnpm --filter web test` — 274 files / 1923 tests
- `pnpm --filter @meld/contracts test` — 18 files / 212 tests
- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web lint` — 0 errors (existing unused-var warnings only)
- `supabase db reset` + `supabase test db` — 47 files / 1320 tests PASS
  (includes `capture_taste.test.sql`)
- `cd apps/mac && swift build && swift test` — all targets PASS

No `apps/web/e2e` Taste-tab suite to mirror.

## Known limits (accepted)

- DNS-rebinding window on link fetch (Task 1 note)
- In-memory compose rate limiter is per server instance
- “Let Orion decide again” clears a lock but does not force an immediate rethink
