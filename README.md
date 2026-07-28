# Meld

Meld is a collaborative product-discovery platform for small product teams. A team
talks through an idea in a **Discovery Room** — messages, uploaded evidence, and
recorded decisions — and that conversation becomes a durable, reviewable PRD rather
than scrollback that gets lost.

The defining constraint is that **the platform never funds AI usage**. There is no
platform-owned API key and no shared credit pool. Every AI task runs through the
initiating user's own authenticated Codex or Claude subscription, on their machine,
and only when a user explicitly mentions the agent or requests an action. Humans
accept the PRD and decide what becomes a feature; the agent drafts and recommends.

Full product intent lives in
[`docs/design/specs/2026-07-24-personal-ai-product-lifecycle-mvp-design.md`](docs/design/specs/2026-07-24-personal-ai-product-lifecycle-mvp-design.md),
and implementation status is tracked in
[`docs/product-feature-checklist.md`](docs/product-feature-checklist.md).

## Getting started

Prerequisites: **Node 20.19.0** (see `.nvmrc`), **pnpm 10.28.1**, **Docker** (for the
local Supabase stack), and the [Supabase CLI](https://supabase.com/docs/guides/local-development)
(`brew install supabase/tap/supabase` — it is not a repo dependency).

```bash
pnpm install
supabase start                  # boots Postgres 17, Auth, Storage, Mailpit; applies supabase/migrations
cp .env.example apps/web/.env.local
# fill in NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (printed by `supabase start`, or `supabase status`)
# and INVITATION_TOKEN_SECRET (command is in the file)
pnpm dev                        # Next.js on http://localhost:3000
```

Useful local endpoints once Supabase is up: API `http://127.0.0.1:54321`,
Postgres `54322`, Studio `http://127.0.0.1:54323`, Mailpit `http://127.0.0.1:54324`.

Sign-in is passwordless magic link. With `INVITATION_EMAIL_TRANSPORT=mailpit` and
`MAILPIT_URL=http://127.0.0.1:54324`, both auth and invitation emails land in Mailpit
instead of a real inbox — that is the recommended local setup.

### Environment variables

`.env.example` is the source of truth; Next.js reads them from `apps/web/.env.local`.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Origin used to build magic-link and invitation callback URLs. Must match a redirect URL in `supabase/config.toml`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API URL (`http://127.0.0.1:54321` locally). |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key. Client- and server-side requests both use it — authorization comes from RLS, not from a service-role key. |
| `INVITATION_TOKEN_SECRET` | HMAC secret for signed invitation tokens. Generate with `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='`. |
| `INVITATION_EMAIL_TRANSPORT` | `resend` (default) or `mailpit`. |
| `MAILPIT_URL` | Mailpit base URL when the transport is `mailpit`. |
| `RESEND_API_KEY` | Required only when the transport is `resend`. |
| `INVITATION_FROM_EMAIL` | From header on invitation emails. |

`MELD_E2E_FAKE_WORKSPACES` / `MELD_E2E_FAKE_DISCOVERY` are test-only gates that swap in
in-memory data so Playwright can run without a database; the Playwright config sets them.

## Architecture

A pnpm + Turborepo monorepo. `apps/web` is a Next.js 16 App Router application and is
where essentially all product behaviour lives. `apps/gateway` is a Fastify service that
currently exposes only `/health` — it is the placeholder for the connector/WebSocket
runtime. `packages/contracts` holds the Zod schemas shared across both (providers, AI
tasks, PRD shape, WebSocket frames).

The request path is deliberately flat: **React Server Components and server actions →
repository → Postgres**, with no REST API layer in between. Each feature folder under
`apps/web/src/features/*` owns its `actions.ts` (`"use server"`, validates input with
Zod, calls `revalidatePath`) and its `schemas.ts`. Discovery — the largest feature —
additionally isolates every Supabase query behind `repository.ts`; smaller features
still query from their actions, and moving them behind a repository is the direction of
travel. `apps/web/src/proxy.ts` refreshes the Supabase session on each request, and the
server client in `apps/web/src/lib/supabase/server.ts` carries the caller's JWT into
every query.

**Authorization is enforced in the database, not in the application.** Every request
runs as the signed-in user under row-level security, so a repository has no way to reach
another organization's rows even if a check is forgotten in TypeScript. Schema and
policies live in `supabase/migrations/*.sql`, and the policies are tested directly with
pgTAP in `supabase/tests/*.sql`. Storage buckets (`organization-logos`,
`discovery-attachments`) are governed by the same policies.

UI is built exclusively from the [Astryx](AGENTS.md) design system — no raw `<div>`,
no hardcoded colors or pixel values. `pnpm check:astryx` enforces this in CI.

## Checks

```bash
pnpm test        # Astryx conventions + SQL guards + workspace unit tests (Vitest)
pnpm typecheck
pnpm lint
pnpm build
```

CI (`.github/workflows/ci.yml`) runs exactly that sequence. Two extra suites are not
wired into `pnpm test` because they need infrastructure:

- `supabase test db` — pgTAP authorization tests. They assume an empty database, so
  running them against a dev database with real data will fail on row counts.
- `pnpm exec playwright test` — browser E2E in `e2e/`; the config starts its own dev
  server on port 3000, so stop yours first.
