# Task 5 Report — E2E view of a seeded PRD

## Status

DONE

## Summary

Added a deterministic fake Discovery Room and seeded `RoomPrd`, exposed PRD reads through the `DiscoveryBackend` contract, and added a Playwright regression that authenticates against the configured E2E origin, loads the real Next.js room page, follows the Astryx PRD tab link, and verifies the rendered PRD title and Executive summary section.

The regression runs beside the user's port-3000 development server. Next 16 locks its build directory even when a second server uses another port, so Playwright now opts into `.next-e2e` through `MELD_E2E_DIST_DIR`; the app TypeScript configuration includes that directory's generated route types. The user's server was not stopped and still returned HTTP 307 at `http://127.0.0.1:3000/` after the final run.

The approved PRD UI refinements were preserved. No PRD component or room-page UI source was changed.

## Exact files changed

- `apps/web/.gitignore` — ignores the isolated Next E2E build directory.
- `apps/web/next.config.ts` — supports the E2E-only build directory selected by environment.
- `apps/web/tsconfig.json` — includes route types generated under `.next-e2e`.
- `playwright.config.ts` — starts the Playwright server with `MELD_E2E_DIST_DIR=.next-e2e` while retaining `MELD_E2E_PORT`.
- `apps/web/src/features/discovery/backend.ts` — adds `DiscoveryBackend.getRoomPrd`.
- `apps/web/src/features/discovery/e2e-fake.ts` — seeds the stable fake room and owner participation.
- `apps/web/src/features/discovery/fake-backend.ts` — reports `hasPrd` for the seeded room and returns the canned PRD after the normal participant check.
- `apps/web/src/features/discovery/supabase-backend.ts` — delegates `getRoomPrd` to `createPrdRepository(supabase)`.
- `apps/web/src/features/prd/queries.ts` — routes fake-gated PRD reads through `getDiscoveryBackend` while retaining the existing production repository path.
- `e2e/prd-view.spec.ts` — adds the real-server seeded PRD view regression.
- `.superpowers/sdd/2026-08-02-prd-view-and-generation/task-5-report.md` — this report.

## RED evidence

The plan's filtered command was tried first:

```text
MELD_E2E_PORT=3317 pnpm --filter web exec playwright test e2e/prd-view.spec.ts
Exit 1
Error: No tests found.
```

`pnpm --filter web exec` changes the process working directory to `apps/web`, so the root `e2e/` path and root Playwright configuration are not discovered. The corrected root command initially exposed Next 16's shared build lock:

```text
MELD_E2E_PORT=3317 pnpm exec playwright test e2e/prd-view.spec.ts
Exit 1
[WebServer] Another next dev server is already running.
[WebServer] Local: http://localhost:3000
```

After isolating the Playwright build directory, the regression reached the real Next.js page and failed for the intended missing behavior before fake PRD wiring was added:

```text
MELD_E2E_PORT=3317 pnpm exec playwright test e2e/prd-view.spec.ts
Exit 1
1 failed
Error: expect(locator).toBeVisible() failed
Locator: getByRole('link', { name: /^PRD/ })
Error: element(s) not found
```

## GREEN evidence

Final focused browser regression after all implementation and E2E isolation refinements:

```text
MELD_E2E_PORT=3317 pnpm exec playwright test e2e/prd-view.spec.ts
Exit 0
1 passed (27.8s)
```

The test itself completed in 2.6 seconds after cold route compilation. The server output also contains pre-existing warm-up authentication and Astryx runtime-theme notices; neither failed the test.

## Exact verification commands and outputs

```text
pnpm --filter web exec vitest run src/features/discovery/e2e-fake.test.ts src/features/prd
Exit 0
Test Files  4 passed (4)
Tests       24 passed (24)
```

```text
pnpm --filter web typecheck
Exit 0
tsc --noEmit
```

```text
pnpm check:astryx
Exit 0
node scripts/check-astryx-conventions.mjs apps/web/src
```

```text
pnpm --filter web exec eslint next.config.ts src/features/discovery/backend.ts src/features/discovery/e2e-fake.ts src/features/discovery/fake-backend.ts src/features/discovery/supabase-backend.ts src/features/prd/queries.ts
Exit 0
```

```text
pnpm exec eslint playwright.config.ts e2e/prd-view.spec.ts
Exit 0
```

```text
pnpm --filter web exec vitest run next.config.test.ts
Exit 0
Test Files  1 passed (1)
Tests       2 passed (2)
```

```text
git diff --check
Exit 0
```

```text
curl -sS -o /dev/null -w 'port3000_http=%{http_code}\n' http://127.0.0.1:3000/
Exit 0
port3000_http=307
```

## Commit hashes

- `eb20384` — `test(prd): e2e viewing a seeded PRD through the fake backend`

The report is committed separately after this implementation commit so it can record the implementation hash.

## Self-review

- Confirmed with `pnpm exec astryx component TabList` and `pnpm exec astryx component Tab` that Astryx navigation tabs expose link semantics and `aria-current`, so the browser selector correctly uses `getByRole("link", { name: /^PRD/ })` rather than a nonexistent `role="tab"`.
- Verified the fake PRD path performs `fakeGetRoom` before returning the document, preserving the fake backend's authentication and participant authorization boundary.
- Verified only the deterministic seeded room reports `hasPrd`; rooms created by unrelated E2E flows retain `hasPrd: false`.
- Verified the production query behavior remains repository-backed, and the Supabase backend implementation delegates to the same repository method.
- Reran the focused E2E after the final `.next-e2e` configuration, confirming it no longer edits `tsconfig.json` at runtime.
- Ran `git diff --check`, affected lint, typecheck, unit tests, and the Astryx convention check.
- Reviewed the final file list and confirmed no approved PRD document, minimap, badge, icon, or tab component refinements were changed.

## Concerns

None. The final test run passes on a separate port while the user's port-3000 server remains available.
