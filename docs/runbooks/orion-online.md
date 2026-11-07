# Orion Online

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
   curl -si -H "Upgrade: websocket" http://127.0.0.1:8787/ws
   ```

   Expect HTTP 401.

Optional: throwaway connector via `scripts/fake-connector.ts` with `--credential <deviceId.secret>` against `ws://127.0.0.1:8787/ws`. Do not pair the installed LaunchAgent `com.meld.agent`. Canvas two-tab sync needs the web app running with a matching `MELD_CANVAS_SESSION_SECRET`.
