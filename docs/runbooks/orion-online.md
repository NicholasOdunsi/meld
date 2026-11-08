# Orion Online

## Production addresses

| Piece | Address |
|---|---|
| Website (Vercel project `orion-workspace`) | https://orion-workspace-phi.vercel.app |
| Gateway (Cloudflare Worker `orion-gateway`) | https://orion-gateway.nicholasodunsi.workers.dev (sockets: `wss://…/ws`) |
| Database (Supabase) | project ref `edpqfigqmtbqzaauhquc` |

The Vercel project named `orion` is an unrelated older app — do not deploy to it.
`orion-workspace.vercel.app` belongs to another account, hence the `-phi` address.

Production env on Vercel: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_MELD_PAIR_COMMAND`,
`MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY`, `MELD_SHELF_SERVICE_ROLE_KEY`,
`INVITATION_TOKEN_SECRET`, `DEEPSEEK_API_KEY`, `DEEPSEEK_VISION_MODEL`,
`MELD_USER_FLOW_TRIAL_ENABLED`, `MELD_CANVAS_SESSION_SECRET`, `MELD_CANVAS_WS_URL`,
and `NEXT_PUBLIC_TLDRAW_LICENSE_KEY` once the licence arrives. `NEXT_PUBLIC_*`
values must stay plain (non-Secret) variables: they are baked in at build time and
a Secret variable reaches the CI build only as a `[SENSITIVE]` placeholder.

Testing the gateway with `curl` needs `--http1.1`; over HTTP/2 the `Upgrade`
header is dropped and the Worker answers 426.

## Run the Cloudflare gateway locally

Prerequisites: local Supabase running (`supabase status`), Colima if that is how Docker is provided.

1. Copy env vars and fill secrets (`.dev.vars` is gitignored — never commit it):

   ```bash
   cp apps/gateway-worker/.dev.vars.example apps/gateway-worker/.dev.vars
   ```

   Set `GATEWAY_SUPABASE_URL` and `GATEWAY_SUPABASE_SERVICE_ROLE_KEY` from `supabase status`. Set `MELD_CANVAS_SESSION_SECRET` to the same 32+ character value as `apps/web/.env.local` (generate one with `openssl rand -base64 48` if web does not have it yet).

2. Free port 8787 if something else is bound, then start the Worker:

   ```bash
   pnpm --filter @meld/gateway-worker dev -- --port 8787
   ```

3. Health check:

   ```bash
   curl -s http://127.0.0.1:8787/health
   ```

   Expect `{"status":"ok"}`.

4. Unauthenticated WebSocket upgrade must be rejected:

   ```bash
   curl --http1.1 -si -H "Upgrade: websocket" -H "Connection: Upgrade" http://127.0.0.1:8787/ws
   ```

   Expect HTTP 401.

Optional: throwaway connector via `scripts/fake-connector.ts` with `--credential <deviceId.secret>` against `ws://127.0.0.1:8787/ws`. Do not pair the installed LaunchAgent `com.meld.agent`. Canvas two-tab sync needs the web app running with a matching `MELD_CANVAS_SESSION_SECRET`.

## GitHub Actions secrets

These repository secrets power the Deploy and Backup workflows. Set them with `gh secret set <NAME>` (or the GitHub UI). Never commit values.

| Secret | Used by | Notes |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | Deploy, Backup | Supabase account access token |
| `SUPABASE_PROJECT_REF` | Deploy, Backup | Hosted project reference ID |
| `SUPABASE_DB_PASSWORD` | Deploy, Backup | Database password for the hosted project |
| `VERCEL_TOKEN` | Deploy | Vercel personal access token |
| `VERCEL_ORG_ID` | Deploy | From `.vercel/project.json` after linking |
| `VERCEL_PROJECT_ID` | Deploy | From `.vercel/project.json` after linking |
| `CLOUDFLARE_API_TOKEN` | Deploy | Token with Workers edit permission |
| `CLOUDFLARE_ACCOUNT_ID` | Deploy | Cloudflare account ID |
| `ORION_PROD_APP_URL` | Deploy (smoke) | Production website origin, e.g. `https://…vercel.app` |
| `ORION_PROD_GATEWAY_URL` | Deploy (smoke) | Production Worker origin, e.g. `https://….workers.dev` |
| `ORION_BACKUP_AGE_RECIPIENT` | Backup | Public `age1…` key; private key stays in the owner's password manager only |

Worker runtime secrets (`GATEWAY_SUPABASE_URL`, `GATEWAY_SUPABASE_SERVICE_ROLE_KEY`, `MELD_CANVAS_SESSION_SECRET`) are set with `wrangler secret put`, not as GitHub Actions secrets.

## Point your Mac at online Orion

### Connector

1. In online Orion → **Settings → AI connections**, generate a join code.
2. From the repo (rebuild/reinstall the bundle first if connector source changed — local-setup runbook point 14):

   ```bash
   MELD_APP_URL=<app url> MELD_GATEWAY_URL=<gateway wss url>/ws pnpm --filter @meld/connector cli pair --join <code>
   ```

3. Confirm with:

   ```bash
   pnpm --filter @meld/connector cli status
   ```

   The status output should show the online gateway URL.

### Shelf

1. Menu-bar **O** → **Disconnect**.
2. **Connect** → set **Orion address** to the app URL.
3. Paste the code from online **Settings → Shelf**.

## Rollback

The database is not rolled back. Schema fixes go forward as new add-only migrations. To undo a bad website or gateway release:

1. **Website (Vercel)** — roll back to the previous production deployment:

   ```bash
   pnpm dlx vercel rollback --token "$VERCEL_TOKEN"
   ```

   Confirm the target deployment when prompted (or pass the deployment URL/id if you know it).

2. **Gateway (Cloudflare Worker)** — roll back the last Worker deploy:

   ```bash
   pnpm --filter @meld/gateway-worker exec wrangler rollback
   ```

3. Re-check smoke endpoints (`ORION_PROD_APP_URL` and `ORION_PROD_GATEWAY_URL/health`) before declaring the rollback done.

## Restore a backup

Backups are encrypted age artifacts from the Backup workflow (30-day retention). Restore only into a **fresh** Supabase project — never overwrite a live production database in place.

1. Download the `orion-backup-*.tar.gz.age` artifact from the Backup workflow run.
2. Decrypt and unpack with the private key from the password manager:

   ```bash
   age -d -i ~/orion-backup-key.txt orion-backup.tar.gz.age | tar -xz
   ```

   That yields `schema.sql` and `data.sql`.
3. Create a new empty Supabase project, then load the dump (use that project's connection string):

   ```bash
   psql "$DB_URL" -f schema.sql -f data.sql
   ```

4. Point the app and Worker at the new project only after verifying auth and data look correct. Storage objects (images) are not included in this backup.

## What to do if a deploy shows a red ✗

1. Open the failed Deploy run in GitHub Actions and read which step failed (Migration guard, Database, Gateway, Website, Smoke check, or Mark deployed).
2. **Migration guard** — a new migration looks destructive. Either rewrite it as add-only, or add `-- orion-allow-destructive` only when you intentionally accept the risk, then re-run.
3. **Database / Gateway / Website** — fix the underlying error (secrets, CLI auth, build). Manual `workflow_dispatch` on Deploy is fine after a fix lands on `main` (or after CI succeeds again).
4. **Smoke check** — the site or Worker may be up but unhealthy. Check Vercel and Cloudflare dashboards; roll back (above) if users are broken.
5. **Mark deployed** — the release may already be live; the `deployed` tag just failed to move. Fix tag push permissions (`contents: write`) and re-run, or move the tag manually once you confirm the release is good.
6. Do not force a new migration that drops data to "undo" a bad deploy — roll the website/gateway back and fix forward in the database.
