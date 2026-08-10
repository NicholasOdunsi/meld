# tldraw Trial Spike Report

Date: 2026-08-10  
Scope: Phase 0 technical spike only

## What Was Exercised

The dedicated Playwright configuration runs `e2e/user-flow-trial.spec.ts` against
`apps/gateway/src/canvas/e2e-main.ts`. The harness uses the real Fastify canvas
WebSocket and HTTP routes, signed `@meld/device-auth` tickets, the pinned tldraw
5.3.0 schema, `TLSocketRoom`, and `SQLiteSyncStorage`.

The bounded scenario proves:

- two editor sessions in one room commit and receive each other's document diffs;
- a viewer receives `isReadonly: true` and a direct push is discarded;
- server-authored marker evidence is separate from client audit evidence;
- evidence records authenticated actor, session, document clock, and touched IDs;
- a second room does not receive the first room's session evidence;
- a room can be closed, reopened against the same SQLite directory, and hydrate
  the committed page state;
- the trial is disabled by default and rejects `NODE_ENV=production`;
- a supplied data directory passes file fsync, atomic rename, directory fsync, and
  SQLite `journal_mode=wal`, `synchronous=2` (FULL), and `foreign_keys=1` checks.

The fail-closed ambiguity behavior is covered by the colocated
`mutation-audit-probe` tests. The browser harness additionally asserts that all
reported failure entries are reason-coded and never expose raw ticket material.

## Commands

All commands must use Node 22.23.2:

```bash
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
pnpm test:e2e:canvas-trial
pnpm exec node scripts/canvas-trial/verify-volume.mjs /path/to/canvas-data
```

Chromium must be installed for the Playwright run:

```bash
pnpm exec playwright install chromium
```

Normal application tests do not start this harness. It uses an in-memory
single-process authority substitute so no hosted PostgreSQL, Supabase session,
or external WebSocket service is required. This is intentional for a bounded
trial and is not evidence that a production PostgreSQL advisory lease or hosted
filesystem behaves correctly.

## Result And Gates

The local trial result is a bounded **gateway-only pass**. It is not a product or
production go. The route, exact-version sync protocol, viewer write protection,
SQLite restart path, 50-commit audit stress case, and evidence are executable and
testable. The Next app gate is skipped unless
`MELD_CANVAS_E2E_APP_BASE_URL` points at a separately configured authenticated
Next instance. That skip is expected when Supabase is unavailable.

## Gate Table

| Gate | Command / setup | Exit | Result | Reopen count | Screenshots | Limitation |
| --- | --- | ---: | --- | ---: | --- | --- |
| Gateway convergence | `pnpm test:e2e:canvas-trial` | 0 | 3 gateway/volume/config tests pass | 1 | Health response only | Uses in-memory authority substitute |
| Next user-flow UI | `MELD_CANVAS_E2E_APP_BASE_URL=... pnpm test:e2e:canvas-trial` | skipped without env | App gate is explicit and fails if auth/canvas cannot load | 0 | Playwright trace on failure | Requires real Next + authenticated Supabase |
| Viewer write guard | Included in gateway test | 0 | `isReadonly=true`, direct push discarded | 0 | None | Raw protocol client, not production UI controls |
| Audit attribution | Included in gateway test | 0 | 53 client commits + 1 server marker; zero failures | 0 | None | In-memory authority only |
| SQLite restart | Included in gateway test | 0 | Persisted page rehydrated after restart | 1 | None | Local filesystem, not hosting volume |
| Volume durability | `node scripts/canvas-trial/verify-volume.mjs <dir>` | 0 | fsync/rename/reopen + WAL/FULL/foreign keys | 1 reopen | JSON output | Does not certify managed storage |
| Production readiness | PostgreSQL, hosted volume, license review | not run | blocked by design | n/a | n/a | Commercial and deployment gates remain open |

This is **not** a production go. Before production work begins, repeat the same
volume probe on the selected hosting volume, run authority/convergence tests with
the real PostgreSQL deployment, verify operational limits and backup/restore,
and complete tldraw commercial licensing. No production semantic user-flow model,
AI generation, PRD linking, or custom shapes are included in this report.
