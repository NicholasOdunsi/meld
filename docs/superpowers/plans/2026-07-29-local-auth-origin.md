# Local Auth Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new local magic links return to
`http://127.0.0.1:3000/auth/callback` instead of `localhost`.

**Architecture:** Supabase Auth and the web application each contribute an
origin to the magic-link flow. Configure both to the same canonical
`127.0.0.1:3000` origin, retain both callback hosts in the redirect allowlist,
and restart the affected services so new emails use the updated values.

**Tech Stack:** Supabase CLI `2.109.1`, Next.js 16, pnpm.

## Global Constraints

- Change local development configuration only.
- Keep both localhost and 127.0.0.1 callback URLs allowed.
- Do not change production authentication logic or URL protocol validation.
- Previously issued magic links are immutable; verify using a newly requested
  message.

---

### Task 1: Align Local Redirect Configuration

**Files:**
- Modify: `supabase/config.toml`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Supabase `auth.site_url` and web `NEXT_PUBLIC_APP_URL`.
- Produces: canonical local origin `http://127.0.0.1:3000`.

- [ ] **Step 1: Update Supabase Auth fallback**

Set:

```toml
site_url = "http://127.0.0.1:3000"
```

Keep these allowlist entries:

```toml
"http://localhost:3000/auth/callback",
"http://127.0.0.1:3000/auth/callback",
```

- [ ] **Step 2: Update the environment example**

Set:

```dotenv
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

- [ ] **Step 3: Validate the diff**

Run:

```bash
git diff --check
```

Expected: exit zero.

- [ ] **Step 4: Commit**

```bash
git add .env.example supabase/config.toml
git commit -m "fix: align local auth redirect origin"
```

---

### Task 2: Restart and Verify the Local Flow

**Files:**
- Runtime only; no source files.

**Interfaces:**
- Consumes: the Task 1 configuration and local Supabase credentials.
- Produces: healthy Supabase, gateway, web, Studio, and Mailpit endpoints.

- [ ] **Step 1: Stop affected services**

Stop the running web process and the pinned local Supabase stack. Leave the
gateway process available for a health check after Supabase returns.

- [ ] **Step 2: Restart Supabase**

Run:

```bash
pnpm dlx supabase@2.109.1 start --exclude vector
```

Expected: local stack healthy on ports `54321`–`54324`.

- [ ] **Step 3: Restart web with the canonical origin**

Launch Next.js on `127.0.0.1:3000` with:

```text
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

and the local Supabase publishable/service-role values.

- [ ] **Step 4: Verify endpoints**

Require:

```text
web /             → 307 to /sign-in
gateway /health   → 200
Studio            → reachable
Mailpit           → 200
```

- [ ] **Step 5: Verify a newly issued magic link**

Request a fresh magic link through the running app, inspect the new Mailpit
message, and require its redirect target to use:

```text
http://127.0.0.1:3000/auth/callback
```

Do not use an older message generated before the restart.
