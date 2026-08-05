# New-machine setup runbook (for an agent)

Hand this file to a coding agent on a freshly-cloned Meld workspace. It sets up
everything needed to run the app locally the way it runs on the original machine.
Work top to bottom; stop and ask the human at the two **DECISION** points.

The repo (code, `supabase/migrations/`, `supabase/config.toml`, `.env.example`)
already came over via git. What is NOT in git and must be recreated: the local
toolchain, `apps/web/.env.local` (secrets), the local Supabase database contents,
and the connector/managed-Claude credentials. That's what this runbook handles.

---

## 1. Toolchain

Install and verify exact versions:

- **Node 20.19.0** — the repo pins it in `.nvmrc`. Do NOT use a newer global node.
  ```bash
  nvm install 20.19.0 && nvm use   # from repo root, reads .nvmrc
  node -v                          # must print v20.19.0
  ```
- **pnpm 10.28.1** — `corepack enable && corepack prepare pnpm@10.28.1 --activate`
- **Docker Desktop** — install, launch, confirm `docker ps` works.
- **Supabase CLI** (not a repo dependency) — `brew install supabase/tap/supabase`

## 2. Install dependencies and boot Supabase

```bash
pnpm install
supabase start   # boots Postgres 17, Auth, Storage, Mailpit; applies all migrations
supabase status  # prints local API URL + anon (publishable) + service_role keys — keep this output
```

`supabase start` produces a schema-correct but **empty** database.

## 3. Create `apps/web/.env.local` (gitignored — must be recreated)

```bash
cp .env.example apps/web/.env.local
```

Fill these values:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the **anon** key from `supabase status` |
| `MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY` | the **service_role** key from `supabase status` |
| `GATEWAY_SUPABASE_SERVICE_ROLE_KEY` | the **service_role** key from `supabase status` |
| `INVITATION_TOKEN_SECRET` | generate: `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='` |
| `INVITATION_EMAIL_TRANSPORT` | set to `mailpit` for local dev |
| `MAILPIT_URL` | `http://127.0.0.1:54324` |

Leave `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_DB_URL`, and the
`GATEWAY_*` ports at their `.env.example` defaults. `RESEND_API_KEY` is not needed when
the transport is `mailpit` (auth + invitation emails land in Mailpit at
`http://127.0.0.1:54324`).

## 4. DECISION — database data

`supabase start` gave you an empty DB. Ask the human which they want:

- **Fresh DB (default):** do nothing. Sign in later via magic link → the email appears
  in Mailpit (`http://127.0.0.1:54324`); a new org is created on first sign-in.
- **Bring existing dev data over:** on the OLD machine run
  `docker exec supabase_db_meld pg_dump -U postgres -d postgres --data-only > meld-data.sql`,
  copy the file across, then here run
  `docker exec -i supabase_db_meld psql -U postgres -d postgres < meld-data.sql`.
  (Container name is `supabase_db_meld`.)

## 5. Run and verify

```bash
pnpm dev                 # Next.js on http://localhost:3000
```

Then confirm the environment is healthy:

```bash
pnpm typecheck
pnpm test                # Astryx conventions + SQL guards + unit tests
```

Open http://localhost:3000, trigger a magic-link sign-in, and confirm the email
lands in Mailpit and sign-in completes.

## 6. DECISION — connector / managed-Claude flow (only if the human uses it)

The provider-runs-on-your-own-machine flow relies on machine-local credentials that
do NOT transfer. If the human uses it, they must re-pair on this laptop.

Known gotcha to apply proactively: the managed Claude node cannot read the token from
the macOS login keychain — write a **file-based `.credentials.json`** into its isolated
config dir instead. Ask the human before touching this; skip if they only use the web app.

---

### Notes / gotchas

- Never `pkill -f "next dev"` — it can kill another running server. Stop the specific one.
- `supabase test db` (pgTAP) assumes an EMPTY database; running it against a populated
  dev DB fails on row counts. That's expected, not a regression.
- Local endpoints once Supabase is up: API `http://127.0.0.1:54321`, Postgres `54322`,
  Studio `http://127.0.0.1:54323`, Mailpit `http://127.0.0.1:54324`.
