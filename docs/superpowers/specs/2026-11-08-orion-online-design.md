# Orion Online — design

Status: approved in brainstorm 2026-11-08 · Owner: Nicholas Odunsi
Comes before: the Orion Mac app (its own spec, next). Without this project the
Mac app would still need Terminal, Docker and `pnpm dev` running behind it.

---

## Part A — Read this first (plain language)

### What it is

Your real Orion moves off your Mac and onto free online services, privately,
for **$0 a month**. You open it at a private web address, sign in with your
email, and only you can get in. It works with your Mac's Terminal closed.

Your Mac keeps running just two small Orion things: the **AI connector** (it
uses your Claude / Codex / DeepSeek setup) and the **Orion Shelf** menu-bar
app. Both get pointed at online Orion. The local setup on your Mac stays as the
**workshop** where agents build and test — it is never your real data again.

### Where everything lives

| Piece | Home | Cost |
|---|---|---|
| Database, sign-in, image storage, live updates | Supabase free project | $0 |
| Website | Vercel Hobby (address like `orion-nicholas.vercel.app`) | $0 |
| Gateway (connector link + live canvas) | Cloudflare Worker + Durable Objects (rewritten) | $0 |
| AI connector and Shelf | Your Mac, as today | $0 |

No domain name is needed.

### What comes with you

From your Mac's Orion: the **41 inspiration images** (labels and notes
included) and your **taste board** (tiles, dislikes, and any Keep it / Not me
history). The "Testing" room stays behind, and so do the "what was off"
signals, because each one belongs to a screen inside that room. (Your Mac's
Orion currently has **no saved design system profile** — if you create one
before the move, it comes along too.)

### How it stays safe and free

- **Only you.** New sign-ups are switched off once your account exists.
- **Never falls asleep.** Free Supabase pauses a project after a week unused;
  the gateway pings it once a day so that never happens.
- **Ships itself.** When work is merged to `main` and the tests pass, it goes
  live automatically — database first, then gateway, then website. If tests
  fail, nothing deploys.
- **Data is never wiped by a deploy.** Database changes are add-only; a deploy
  that would delete tables, columns or rows stops and asks for a human OK.
- **Daily backup.** Your database is copied once a day, **encrypted**, and the
  last 30 days are kept. (Encrypted because your GitHub repository is
  **public** — anyone can read the code, so backups must be unreadable without
  your key. Your data itself never goes into the repository.)
- **Undo.** Website and gateway can each be switched back to the previous
  version in one step.

### What you do by hand (once, about 20 minutes)

1. Create a free **Supabase** project (pick the region nearest you).
2. Create a free **Vercel** account by signing in with GitHub.
3. Create a free **Cloudflare** account.
4. Copy the access keys listed in Part C into the private file
   `.context/orion-online-secrets.env` in this workspace. An agent stores them in
   GitHub's secret settings and deletes the file. Save the **backup key** in
   your password manager too — without it the backups can't be opened.
5. Open the new Orion address and sign in. An agent then runs the data move and
   switches off sign-ups.
6. Re-pair the AI connector (Settings → AI connections) and reconnect the Shelf
   (Settings → Shelf), the same way as before.
7. Apply for a free tldraw hobby licence at tldraw.dev (non-commercial; keeps the
   watermark) and paste the key as `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`.

### What "done" means

- Orion opens at its online address with Terminal closed and Docker stopped.
- The 41 images and the taste board are there.
- Asking the agent something in a room gets a reply (connector online).
- A canvas edit in one browser tab appears in another.
- Saving an image with the Shelf lands it in the online library.
- A test merge to `main` deploys itself, and the daily backup has run once.

### Not in this project

The Mac app itself · a custom domain · Step 2 (documents) · multi-user features.

---

## Part B — Technical design (for implementers)

### B1. Architecture

```
Browser / (later) Mac app ──HTTPS──▶ Vercel: apps/web (Next.js)
        │                                  │ supabase-js (anon / service role)
        │ wss /canvas/:room?ticket=        ▼
        ▼                          Supabase (free): Postgres, Auth, Storage, Realtime
Cloudflare: apps/gateway-worker            ▲
  Worker (router) ──▶ DeviceHub DO ────────┘ supabase-js HTTPS (rpc)
                 └──▶ CanvasRoom DO (one per canvas, DO SQLite storage)
        ▲
        │ wss /ws (device bearer token)
Mac: com.meld.agent (connector)        Mac: Orion Shelf ──HTTPS──▶ Vercel /api/shelf/**
```

### B2. Gateway on Cloudflare

New package `apps/gateway-worker` (Wrangler, `compatibility_flags =
["nodejs_compat"]`). The existing `apps/gateway` stays in the repo as the
local-dev and Playwright canvas-trial gateway; the Worker ports only production
behaviour. Pure logic is moved, not rewritten: `@meld/contracts` message
schemas, `@meld/device-auth`, `tasks/task-repository.ts`,
`ws/protocol-handler.ts` and the sweeper's selection logic are lifted with only
their I/O seams changed.

**Worker (router).** Routes:
- `GET /health` → `{status:"ok"}`.
- `GET /ws` (WebSocket upgrade) → authenticates the device bearer token with
  `authenticateDevice` *before* upgrade (401 on failure), then forwards to the
  single `DeviceHub` (`idFromName("hub")`) with the authenticated device id in
  an internal header.
- `GET /canvas/:roomId?ticket=` → verifies the canvas ticket (existing
  `MELD_CANVAS_SESSION_SECRET` HMAC scheme, unchanged) and forwards to
  `CanvasRoom` `idFromName(`${workspaceId}:${roomId}`)`.
- `scheduled` (Cron Trigger, daily) → keep-alive: one lightweight PostgREST /
  supabase-js request against Supabase (so the project registers API activity).

**DeviceHub Durable Object.** Replaces `DeviceSessionRegistry`, `DeviceSession`
and the `setInterval` sweeper.
- Uses the WebSocket Hibernation API (`ctx.acceptWebSocket(ws, [deviceId])`,
  `webSocketMessage`, `webSocketClose`); device id is recovered from tags after
  wake. Per-socket message ordering is preserved by serialising handling per
  device (same guarantee `DeviceSession.enqueueMessage` gives today).
- Sends `session.accepted { heartbeatSeconds }` on connect, then runs
  `sweepDevice(deviceId)` (today's `onConnect`).
- Dispatch sweep runs from a DO **alarm** every `GATEWAY_POLL_INTERVAL_MS`
  (default 5000) **only while ≥ 1 socket is connected**; the last close cancels
  the alarm. `reapExpiredTaskLeases` runs in the same alarm. With no device
  connected nothing can be dispatched, and leases are reaped on the next
  connect's sweep.
- Heartbeat watchdog: the alarm also closes sockets whose last message is older
  than `2 × heartbeatSeconds` (replaces `ws/heartbeat-watchdog.ts`).
- Database: HTTPS via supabase-js (`rpc`); no Postgres connection.

**CanvasRoom Durable Object.** Replaces `canvas-room-manager.ts`,
`sqlite-canvas-room.ts` and `canvas-authority.ts`.
- `TLSocketRoom` from `@tldraw/sync-core` with its built-in
  `DurableObjectSqliteSyncWrapper` over `ctx.storage.sql`.
- Durable Objects guarantee a single live instance per id, so the Postgres
  advisory-lock "authority lease" is removed rather than ported.
- Mutation audit (`mutation-audit-probe.ts`) is ported as-is if it is a
  production behaviour; if it only serves tests it moves to the test harness.
  The implementer decides by reading its call sites and records which in the PR.

**Limits budget (free plan, one user).** Requests: alarms at 5 s while the
connector is online ≈ 17k/day worst case + normal traffic, under 100k/day.
Worker CPU per request is small (routing + HMAC); heavy work is in DOs, which
have a 30 s CPU limit. DO storage: canvases are KB–MB, far under 5 GB.

### B3. Website on Vercel

- Vercel project with root directory `apps/web`, framework Next.js, pnpm.
  Vercel's own Git auto-deploy is **disabled**; the GitHub workflow deploys via
  `vercel build --prod` + `vercel deploy --prebuilt --prod` so ordering is
  controlled.
- Environment (Production): `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `MELD_CANVAS_SESSION_SECRET` (new, ≥ 32 random chars, shared with the Worker),
  `MELD_CANVAS_WS_URL` (`wss://<worker>.workers.dev`), `DEEPSEEK_API_KEY`, plus
  every other variable `apps/web/.env.local` sets today that production code
  reads. The implementer produces the definitive list by grepping
  `process.env` in non-test web code and records it in
  `docs/runbooks/orion-online.md`.
- **Canvas production gate.** `isCanvasTrialEnabled()`
  (`apps/web/src/features/canvas/canvas-session.ts`) and
  `apps/web/src/app/api/canvas-session/route.ts` currently require
  `NODE_ENV !== "production"`. Replace that condition with the explicit
  `MELD_USER_FLOW_TRIAL_ENABLED` flag alone; set it `true` in Production.
  Review the other `NODE_ENV` call sites (`e2e-gate.ts` ×3,
  `invitation-email.ts`, `lib/supabase/proxy.ts`): e2e gates must stay **off**
  in production; the others are left as they are unless they break the deploy.

### B4. Supabase (hosted, free)

- Migrations applied with Supabase CLI **2.109.1** (`supabase link` +
  `supabase db push`), never `db reset`.
- Auth: `site_url` = Vercel production URL; redirect allow-list = that URL's
  `/auth/**`; email sign-in as today using Supabase's built-in email sender
  (owner-only, low hourly limit — acceptable for one user). After the owner's
  first sign-in, **sign-ups are disabled** (Auth → "Allow new users to sign up"
  off) via the Management API, and the runbook records how to check it.
- Storage buckets come from migrations (they upsert bucket rows), so nothing is
  created by hand.

### B5. One-time data move

Script `scripts/orion-online/move-data.mjs`, run from the workspace once the
owner has signed in online. Inputs: local DB URL, local Storage URL + service
key, remote Supabase URL + service key, remote DB URL. Steps:

1. Resolve **source** owner (the single `created_by` on local
   `inspiration_items`) and workspace, and **target** owner + workspace (the
   only user / workspace online). Abort if either side has ≠ 1.
2. Copy rows, rewriting `workspace_id`, `created_by` / `user_id` to the target
   ids and keeping primary keys (so re-runs are idempotent via
   `on conflict do nothing`):
   - `inspiration_items` (+ the image object from bucket `inspiration`;
     `storage_path` is `<workspace_id>/<file>`, so the prefix is rewritten to
     the target workspace id), `inspiration_labels`;
   - `taste_profiles`, `taste_suggestions` (`evidence_item_ids` kept — the
     items keep their ids);
   - `design_system_profiles`, `design_system_profile_versions` (+ objects in
     bucket `design-system` at `source_object_path`) — 0 rows locally on
     2026-11-08; copied if present at move time.
   Local counts on 2026-11-08: 41 items, 42 labels, 1 taste profile,
   0 suggestions.
3. Skip: `room_inspiration`, `taste_signals` (`screen_id` is NOT NULL and every
   screen belongs to the "Testing" room), everything room-, PRD-, canvas- or
   AI-task-related.
4. Print a summary (`inspiration_items 41 ✓ …`) and verify counts and a hash of
   each copied image match the source. Exit non-zero on any mismatch.

The script reads from local and writes only to remote; it never writes local.

### B6. Mac helpers

No code change. The connector CLI already honours `MELD_APP_URL` /
`MELD_GATEWAY_URL` at pair time, and the Shelf Connect screen already has an
editable "Orion address" field. Pairing commands live in
`docs/runbooks/orion-online.md` ("Point your Mac at online Orion"). Rebuild +
reinstall the connector bundle first if its source changed (local-setup runbook
point 14), then re-pair with a join code from online Settings → AI connections.
Agents testing locally run a foreground connector with the local URLs and
**must not** re-pair the installed `com.meld.agent`. Reconnect the Shelf with a
new code from online Settings → Shelf.

### B7. Deploy workflow (`.github/workflows/deploy.yml`)

Trigger: `workflow_run` of **CI** on `main` with `conclusion == success`
(so tests gate the deploy), plus manual `workflow_dispatch`. Concurrency group
`deploy`, no cancel-in-progress. Jobs in order:

1. **migration-guard** — diff `supabase/migrations/` against the last deployed
   commit (stored as the tag `deployed`; on the very first deploy there is no
   tag, the hosted database is empty, and the guard is skipped); fail if any new file contains
   `drop table`, `drop column`, `truncate`, `delete from`, or `alter … drop`
   (case-insensitive), unless the file contains the marker comment
   `-- orion-allow-destructive`. A human adds that marker deliberately.
2. **database** — Supabase CLI 2.109.1, `supabase db push` against the hosted
   project.
3. **gateway** — `wrangler deploy` for `apps/gateway-worker`.
4. **website** — `vercel build --prod` + `vercel deploy --prebuilt --prod`.
5. **smoke** — `GET <vercel>/` returns 200 and `GET <worker>/health` returns
   `ok`; on success move the `deployed` tag to this commit.

Rollback (documented in the runbook): `vercel rollback`, `wrangler rollback`.
The database is not rolled back; fixes go forward as new add-only migrations.

### B8. Daily backup (`.github/workflows/backup.yml`)

Daily cron: `supabase db dump` (schema) + `supabase db dump --data-only` for
schemas `public` and `auth`, tar, encrypt with **age** to the public key in
secret `ORION_BACKUP_AGE_RECIPIENT`, upload as an artifact with
`retention-days: 30`. The private key is generated once, stored in the owner's
password manager and nowhere in GitHub. The workflow must never echo secrets or
plaintext dump contents (the repository and its Actions logs are public).
Storage objects (images) are not backed up by this job; restore steps are in the
runbook.

### B9. Secrets (GitHub Actions)

`SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`,
`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ORION_BACKUP_AGE_RECIPIENT`.
Worker secrets (`wrangler secret put`): `GATEWAY_SUPABASE_URL`,
`GATEWAY_SUPABASE_SERVICE_ROLE_KEY`, `MELD_CANVAS_SESSION_SECRET`. All
production secrets are freshly generated; none are copied from local
`.env.local`.

---

## Part C — Owner setup checklist (exact keys)

| Service | Get this | Put it in `.context/orion-online-secrets.env` as |
|---|---|---|
| Supabase | Account → Access Tokens → new token | `SUPABASE_ACCESS_TOKEN` |
| Supabase | Project Settings → General → Reference ID | `SUPABASE_PROJECT_REF` |
| Supabase | The database password you chose when creating the project | `SUPABASE_DB_PASSWORD` |
| Vercel | Account Settings → Tokens → create | `VERCEL_TOKEN` |
| Cloudflare | My Profile → API Tokens → "Edit Cloudflare Workers" template | `CLOUDFLARE_API_TOKEN` |
| Cloudflare | Workers & Pages overview → Account ID | `CLOUDFLARE_ACCOUNT_ID` |

Everything else (Vercel project, API keys, service keys, the backup key pair) is
created or fetched by the agent with these tokens.

Also apply for a free tldraw hobby licence at tldraw.dev (non-commercial; keeps
the watermark) and paste the key as `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` on the
Vercel project (and in the private secrets file if the agent is still
provisioning).

---

## Part D — Delivery order

Steps on the same line can run in parallel.

1. **Gateway Worker** (B2) · **Canvas production gate** (B3) — buildable and
   testable locally before any account exists. (B6 needs no code change; see
   runbook pairing.)
2. **Owner checklist** (Part C) — blocks everything below.
3. **Provision**: Supabase project + `db push` + auth config; Vercel project +
   env; Worker deploy + secrets (B3, B4, B9).
4. **Deploy workflow** (B7) · **Backup workflow** (B8).
5. **Owner signs in → data move** (B5) → **disable sign-ups** (B4).
6. **Owner re-pairs connector and Shelf** (B6) → acceptance checks (Part A
   "done").
7. Retire `apps/gateway` once local dev runs on `wrangler dev` (B2) — **deferred**
   (`apps/gateway` stays for local dev and e2e).

## Part E — Testing

- Gateway Worker: unit tests for routing/auth/ticket checks; existing protocol
  and task-repository tests run unchanged against the lifted modules; DeviceHub
  and CanvasRoom tested with `@cloudflare/vitest-pool-workers` against a local
  Postgres (alarm sweep, hibernation wake keeps device id, heartbeat close,
  two clients syncing a canvas).
- Integration: the real connector against `wrangler dev` + local Supabase
  completes a fake-provider task end to end.
- Canvas gate: unit test that production + flag on → enabled, flag off →
  disabled, and e2e gates stay off in production.
- Data move: run against a scratch remote (a second local Supabase schema or
  throwaway DB) twice; second run copies 0 and still verifies.
- Migration guard: fixture migrations with and without destructive statements
  and the allow marker.
- Live acceptance: the Part A "done" list, recorded in
  `docs/product-feature-checklist.md` under a new **Orion Online** section.

## Revisions during planning (2026-11-08)

1. **No Postgres TCP in the Worker.** The gateway task repository already uses
   Supabase over HTTPS (`supabase.rpc`); Postgres was only for the canvas
   advisory lock, which Durable Objects make unnecessary. The Worker has no
   `GATEWAY_DATABASE_URL` and no `postgres` dependency.
2. **`apps/gateway` is not deleted.** It remains the local-dev and Playwright
   canvas-trial gateway. The Worker ports only production behaviour. Spec
   delivery step 7 is deferred.
3. **No code change for connector or Shelf URLs.** The connector CLI already
   honours `MELD_APP_URL` / `MELD_GATEWAY_URL` at pair time; the Shelf Connect
   screen already has an editable Orion address. Pairing commands live in the
   runbook instead.
4. **tldraw licence.** Required for production HTTPS; a free hobby licence
   fits. The owner applies in Task 11. The web app already reads
   `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`.
