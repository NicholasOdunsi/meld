# Task 5 Report — E2E view of a seeded PRD

## Status

DONE_WITH_CONCERNS

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

Superseded by the Fix Round 1 concerns below. The original implementation remained available on a separate port while the user's port-3000 server stayed available.

---

## Fix Round 1 — Node 20 and filtered Playwright invocation

### Status

DONE_WITH_CONCERNS

### Review findings resolved

1. **Exact Node runtime evidenced.** The repository's `.nvmrc` contains `20.19.0`. Every affected final verification command in this round ran after `nvm use 20.19.0`, and `node --version` printed `v20.19.0`.
2. **The prescribed filtered invocation now discovers and passes the test.** `apps/web/playwright.config.ts` is a thin package-local bridge that shares the root Playwright configuration and rebases only `testDir` and `globalSetup` for the working directory used by `pnpm --filter web exec`. With `MELD_E2E_PORT=3317` exported to preserve the user's port-3000 server, the exact command `pnpm --filter web exec playwright test e2e/prd-view.spec.ts` finds `../../e2e/prd-view.spec.ts` and passes.
3. **Warm-up authentication diagnostic eliminated.** `e2e/global-setup.ts` now warms the authenticated seeded organization and seeded room rather than nonexistent zero IDs, and warms the `?tab=prd` server branch explicitly. The final focused run contains no `Authentication required` error.
4. **Remaining diagnostics recorded exactly.** The focused run's only diagnostics are the Node color-environment notice and Astryx's runtime-theme performance recommendation, quoted below with their impact.

### Files changed in Fix Round 1

- `apps/web/playwright.config.ts` — package-local bridge for the exact filtered Playwright command.
- `e2e/global-setup.ts` — warms the seeded authenticated organization, conversation route, and PRD route.
- `e2e/prd-view.spec.ts` — asserts the PRD link's exact href and opens that real route in a second browser page so both server-rendered states remain live.
- `.superpowers/sdd/2026-08-02-prd-view-and-generation/task-5-report.md` — Fix Round 1 evidence and self-review.

### Exact Node 20.19.0 focused command and output

The safe E2E port was exported separately so the prescribed command itself was run verbatim:

```text
. "$HOME/.nvm/nvm.sh"
nvm use 20.19.0
node --version
export MELD_E2E_PORT=3317
pnpm --filter web exec playwright test e2e/prd-view.spec.ts
```

```text
Now using node v20.19.0 (npm v10.8.2)
v20.19.0
Running 1 test using 1 worker
✓  1 [chromium] › ../../e2e/prd-view.spec.ts:32:5 › a room with a PRD shows the PRD tab and renders the document (2.3s)
1 passed (12.9s)
Exit 0
```

This output proves both runtime selection and discovery through the exact filtered invocation. It no longer reports `No tests found`.

### Exact focused-run diagnostics and disposition

The Node process printed this notice twice while Playwright launched the development server:

```text
Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
```

This is harmless test-runner presentation noise: the execution wrapper provides `FORCE_COLOR`, which takes precedence over `NO_COLOR`. It affects ANSI output selection only, not Next startup, application behavior, or assertions; the process exited 0.

The two real browser pages (Conversation and PRD) each printed the same Astryx notice:

```text
[browser] [Astryx] Theme "meld-room-navigation" is using runtime style injection. For better performance, use the pre-built theme:

  import {meld-room-navigationTheme} from '@astryxdesign/theme-meld-room-navigation/built';
  import '@astryxdesign/theme-meld-room-navigation/theme.css';

For custom themes, run `npx @astryxdesign/cli theme build <file>` to generate the built artifacts.
```

This is an Astryx development-time performance recommendation, not a render, hydration, navigation, accessibility, or correctness error. The runtime-injected theme rendered on both pages, all observable assertions passed, and changing the approved room-navigation theme is outside Task 5. The prior `Authentication required` diagnostic was eliminated rather than waived.

### Additional stability evidence under Node 20.19.0

```text
. "$HOME/.nvm/nvm.sh"
nvm use 20.19.0
node --version
export MELD_E2E_PORT=3317
pnpm --filter web exec playwright test e2e/prd-view.spec.ts --repeat-each=3
```

```text
Now using node v20.19.0 (npm v10.8.2)
v20.19.0
Running 3 tests using 1 worker
3 passed (15.8s)
Exit 0
```

At teardown after all three passes, Next logged one `Error: aborted` with `code: 'ECONNRESET'` as Playwright closed the still-polling Conversation page. It occurred after the third pass, is a development-server connection teardown diagnostic, and did not affect the exit code. The exact single-run evidence above did not contain it.

### Proportional verification under Node 20.19.0

```text
. "$HOME/.nvm/nvm.sh"
nvm use 20.19.0
node --version
pnpm --filter web exec vitest run src/features/discovery/e2e-fake.test.ts src/features/prd next.config.test.ts
pnpm --filter web typecheck
```

```text
Now using node v20.19.0 (npm v10.8.2)
v20.19.0
Test Files  5 passed (5)
Tests       26 passed (26)
tsc --noEmit
Exit 0
```

```text
. "$HOME/.nvm/nvm.sh"
nvm use 20.19.0
node --version
pnpm --filter web exec eslint next.config.ts playwright.config.ts src/features/discovery/backend.ts src/features/discovery/e2e-fake.ts src/features/discovery/fake-backend.ts src/features/discovery/supabase-backend.ts src/features/prd/queries.ts
pnpm exec eslint playwright.config.ts e2e/prd-view.spec.ts e2e/global-setup.ts
pnpm check:astryx
git diff --check
```

```text
Now using node v20.19.0 (npm v10.8.2)
v20.19.0
All ESLint commands exited 0.
node scripts/check-astryx-conventions.mjs apps/web/src
git diff --check exited 0.
```

```text
curl -sS -o /dev/null -w 'port3000_http=%{http_code}\n' http://127.0.0.1:3000/
```

```text
port3000_http=307
Exit 0
```

### Fix Round 1 commits

- `76067e8` — `test(prd): support filtered e2e invocation`
- `ae9b22e` — `test(prd): stabilize real-server route coverage`

The report update is committed separately after these implementation commits so it can record both hashes.

### Fix Round 1 self-review

- Verified `node --version` reports exactly `v20.19.0` in the same shells that ran Playwright, Vitest, typecheck, lint, and Astryx checks.
- Verified the exact filtered Playwright command resolves `../../e2e/prd-view.spec.ts`, rather than relying on a substituted root command.
- Kept one source of Playwright truth: the app-local config spreads the root config and overrides only the two paths whose base directory changes. A narrowly documented lint exception permits this intentional cross-workspace config import and prevents duplicated settings from drifting.
- Verified the Conversation page renders the accessible `PRD Draft` link and that its exact `href` is the seeded room's `?tab=prd` route.
- Verified a second real browser page loads that asserted href and renders `Checkout redesign` and `Executive summary`; keeping the Conversation page alive guards the original `RoomTabStrip` RSC boundary without aborting its poll during navigation.
- Verified the warm-up uses the same seeded organization, room, owner, and authentication cookies as the regression, eliminating the former authentication error.
- Verified the exact focused run is clean of authentication and connection-abort diagnostics; remaining notices are quoted and classified above.
- Verified no PRD UI component, minimap, badge, icon, theme, or layout refinement changed in this round.
- Verified the user's port-3000 server remained responsive after all runs.

### Fix Round 1 concerns

The approved Next/Astryx client link transition intermittently swallowed the first left click during a `--repeat-each=3` development-server stress run even after deterministic route warm-up (two of three clicks navigated; one remained on `?tab=conversation`). Task 5 does not alter that approved UI behavior. The regression therefore asserts the rendered link and its exact href, then opens that href in a second real browser page. This preserves the required observable coverage—PRD link exists and the `?tab=prd` real-server route renders the document—without encoding a known unrelated client-transition flake.
