# Local Auth Origin Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local magic-link sign-in succeed when Meld is accessed at `http://127.0.0.1:3000`.

**Architecture:** Align the gitignored local application origin with the exact browser origin that initiates Supabase's PKCE flow. Restart Next.js so it loads the corrected environment, then verify a newly generated link returns to the same host and establishes a session.

**Tech Stack:** Next.js 16, Supabase Auth PKCE, Mailpit, local environment variables

## Global Constraints

- Update only `apps/web/.env.local`.
- Set `NEXT_PUBLIC_APP_URL` to exactly `http://127.0.0.1:3000`.
- Keep the Supabase API URL, publishable key, invitation configuration, application code, and tracked Supabase configuration unchanged.
- Restart only the Next.js development process listening on port 3000.
- Existing magic links are invalid after the origin change; request a new link after restart.
- Do not commit or expose the gitignored environment file or its local credentials.

---

### Task 1: Align and verify the local authentication origin

**Files:**
- Modify: `apps/web/.env.local`
- Test: local Next.js sign-in flow and Mailpit magic-link callback

**Interfaces:**
- Consumes: `NEXT_PUBLIC_APP_URL`, Supabase's existing `/auth/callback` route, and the local Mailpit inbox.
- Produces: a local Next.js process whose magic links and PKCE verifier cookie both use `http://127.0.0.1:3000`.

- [ ] **Step 1: Confirm the current mismatch**

Run:

```bash
awk -F= '/^NEXT_PUBLIC_APP_URL=/{print $1"="$2}' apps/web/.env.local
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Expected: the environment prints `NEXT_PUBLIC_APP_URL=http://localhost:3000`, and the process on port 3000 is Next.js.

- [ ] **Step 2: Update the local origin**

Change only this line in `apps/web/.env.local`:

```diff
-NEXT_PUBLIC_APP_URL=http://localhost:3000
+NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000
```

- [ ] **Step 3: Restart the exact Next.js process**

Resolve the listener with `lsof -tiTCP:3000 -sTCP:LISTEN`, verify it is the Next.js process with `ps`, terminate that exact PID, and restart:

```bash
pnpm --filter @meld/web dev
```

Expected: Next reports `Environments: .env.local` and becomes ready on port 3000.

- [ ] **Step 4: Verify the local services**

Run:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:54321/auth/v1/health
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:3000/sign-in
```

Expected: both commands print `200`.

- [ ] **Step 5: Verify a newly generated magic link**

In one browser profile:

1. Open `http://127.0.0.1:3000/sign-in`.
2. Request exactly one new magic link.
3. Open Mailpit at `http://127.0.0.1:54324`.
4. Open only the newest message.
5. Confirm its redirect returns to `http://127.0.0.1:3000/auth/callback`.
6. Click the link once.

Expected: the browser establishes a session and continues to the requested workspace or onboarding. It must not reach `/sign-in?error=callback`.

- [ ] **Step 6: Confirm repository hygiene**

Run:

```bash
git check-ignore -v apps/web/.env.local
git status --short
```

Expected: Git reports that `apps/web/.env.local` is ignored and shows no tracked implementation change from this task. Do not commit the environment file.
