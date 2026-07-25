# Task 4 Report: Organization Onboarding and Invitations

## Status

Implemented organization onboarding, member management, durable
invitations, reconstructable same-token delivery retries, explicit
revocation, matching-user acceptance, Astryx UI, and a two-browser-context
Playwright smoke test.

The application stores only the SHA-256 token hash. A fresh invitation UUID
is generated with `randomUUID()`. The link token is the 32-byte
HMAC-SHA-256 output of:

```text
HMAC(
  INVITATION_TOKEN_SECRET,
  "meld/invitation-token/v1" || NUL || invitation UUID
)
```

The HMAC bytes are base64url encoded for the link, and the encoded value is
SHA-256 hashed before persistence. The server-only secret must be a
canonical base64url-encoded 32-byte value with a basic entropy sanity check.
The raw token is reconstructed only in server memory for link delivery and
is never stored or logged.

This design follows the controller resolution made during implementation:
a truly random value with only an irreversible stored hash cannot be
reconstructed for a later retry. A fresh random invitation UUID plus a
domain-separated HMAC provides a 32-byte pseudorandom token that is
reconstructable only by the server. Retry reauthorizes the admin and asks
the database to verify the reconstructed token hash against the active
record before delivery.

## RED

The action and token suites were written before implementation.

```text
pnpm --filter web test -- \
  workspaces/actions.test.ts \
  workspaces/invitation-token.test.ts

Test Files 2 failed | 4 passed
Tests      12 passed
Exit       1
```

The two new suites failed because
`src/features/workspaces/actions.ts` and
`src/features/workspaces/invitation-token.ts` did not exist.

The initial UI smoke also failed before the Vitest alias and jsdom media
query setup were added:

```text
pnpm --filter web test -- workspaces

FAIL onboarding-form.test.tsx
Failed to resolve import "@/features/workspaces/actions"
```

After adding `vitest.config.ts`, the test reached render and failed because
jsdom lacked `window.matchMedia`. The explicit test shim resolved the
browser API dependency.

The initial Playwright run failed before entering the test body because the
new Playwright version did not yet have a Chromium executable. Chromium and
the headless shell were installed with:

```text
pnpm exec playwright install chromium
```

## GREEN

Focused action, token, and UI tests:

```text
pnpm --filter web test -- workspaces

Test Files 7 passed
Tests      29 passed
```

The tests cover:

- atomic onboarding through one database RPC;
- trimmed organization and product names;
- member denial for invitation creation;
- normalized invitee email;
- a fresh UUID per new invitation;
- deterministic same-ID token reconstruction;
- different-ID token separation;
- canonical 32-byte secret validation and low-entropy rejection;
- SHA-256 hashing of the encoded token;
- no raw token in the invitation RPC payload;
- same URL and Resend idempotency key across transient retries;
- no second invitation RPC during delivery retry;
- durable failed-delivery state;
- later admin retry authorization and token-hash verification;
- rejection when the reconstructed hash does not match storage; and
- raw token forwarding only to the authenticated SQL acceptance RPC.

Full repository checks:

```text
pnpm test       passed (8 Astryx checks; 36 workspace tests)
pnpm typecheck  passed (3/3 packages)
pnpm lint       passed (3/3 packages)
pnpm build      passed
pnpm check:astryx passed
git diff --check passed
```

The production build generated:

```text
/onboarding
/[organizationId]/settings/members
/invitations/[token]
```

## Database and SQL Threat Cases

`202607240003_invitations.sql` adds:

- `public.invitations`, with an UUID primary key and only a 32-byte
  `token_hash`;
- normalized email constraints;
- organization, inviter, expiry, acceptance, revocation, delivery status,
  provider message ID, attempted time, and created time;
- a partial unique index allowing only one active invitation per
  organization/email;
- admin-only invitation visibility;
- an atomic organization/admin-membership/default-product RPC;
- admin-only create, delivery authorization, delivery status, and
  revocation RPCs;
- authenticated, normalized-email-matching, expiring, single-use
  acceptance; and
- an organization-member-only member listing RPC.

All seven new security-definer functions set `search_path = ''`, use
schema-qualified relations/functions, revoke the implicit public execute
grant, and grant execute only to `authenticated`.

The 20-case pgTAP test covers:

- atomic organization, admin membership, and product creation;
- non-admin invitation creation denial;
- email normalization;
- 32-byte hash-only persistence;
- absence of the raw token in storage;
- non-admin delivery retry denial;
- retry hash mismatch rejection;
- verified admin retry authorization;
- wrong authenticated email rejection;
- successful matching-email acceptance;
- member membership creation;
- single acceptance/reuse rejection;
- explicit admin revocation;
- revoked-token rejection; and
- expired-token rejection.

PostgreSQL 17 grammar validation:

```text
libpg-query 17.7.4
parsed supabase/migrations/202607240001_core.sql
parsed supabase/migrations/202607240002_rls.sql
parsed supabase/migrations/202607240003_invitations.sql
parsed supabase/tests/tenant_isolation.test.sql
parsed supabase/tests/invitations.test.sql
```

Live database execution was attempted and was not claimed as passing:

```text
docker info
zsh: command not found: docker

pnpm dlx supabase@latest test db \
  supabase/tests/invitations.test.sql
LegacyDbConnectError: PgClient failed to connect
```

## Email Delivery and Retry Semantics

The invitation row is committed before delivery starts. Resend receives an
idempotency key of `invitation/<invitation UUID>`.

The original server action retries one transient provider failure once
while the same raw token remains in memory. A later admin retry:

1. accepts only the organization and invitation UUID;
2. authenticates and reauthorizes the current organization admin;
3. reconstructs the same HMAC token from the UUID and server secret;
4. hashes it;
5. asks the database to compare that hash while locking and verifying the
   active, unaccepted, unrevoked, unexpired invitation;
6. delivers the same link with the same Resend idempotency key; and
7. updates delivery state without token rotation.

A provider failure leaves the invitation valid with `failed` delivery
state. The UI shows `Retry delivery`. No retry path calls the invitation
creation RPC. To create a different token, the admin must explicitly
confirm `Revoke`; only a subsequent invite creates a fresh UUID/token.

Resend errors are converted to stable messages. Provider details and token
values are not logged or persisted.

## Astryx Discovery and UI

Required discovery was completed before UI implementation:

```text
pnpm exec astryx build \
  "small-team organization onboarding, product setup, invitations, and member management"
pnpm exec astryx component FormLayout
pnpm exec astryx component Table
pnpm exec astryx component StatusDot
pnpm exec astryx component Button
```

The build returned `product-detail` as the closest page-layout reference.
The following APIs/templates were also inspected:

```text
pnpm exec astryx template product-detail --skeleton
pnpm exec astryx component Layout
pnpm exec astryx component LayoutHeader
pnpm exec astryx component LayoutContent
pnpm exec astryx component TextInput
pnpm exec astryx component Link
pnpm exec astryx component HStack
pnpm exec astryx template TableRichCellTable
pnpm exec astryx template LayoutHeaderWithActions
pnpm exec astryx template StatusDotStatusIndicators
pnpm exec astryx search "side navigation link item"
```

The onboarding page uses `AppShell`, `Center`, `Card`, `VStack`,
`FormLayout`, `TextInput`, `Banner`, and `Button`. It shows field errors,
pending button state, and retryable server errors.

The organization shell uses the existing `AppFrame`/`SideNav`. The members
page uses one `Layout`, an edge-to-edge `Table` with proportional columns,
and `StatusDot` paired with visible status text. It shows member role,
invitation delivery/acceptance/revocation/expiry state, expiration, and
admin-only retry/revoke controls. Revoke requires explicit confirmation.
Dense member and invitation rows are not Card-wrapped.

`pnpm check:astryx` confirms no raw layout `div`/`span`, utility classes,
custom stylesheets, raw colors/pixels, Tailwind, or StyleX compiler usage.

## Browser Test

The smoke test uses a development-only, production-disabled in-process
workspace fake. It is active only when:

```text
NODE_ENV !== "production"
MELD_E2E_FAKE_WORKSPACES=true
```

The fake authenticates two browser contexts with test-only cookies and
persists only invitation token hashes. It never calls hosted Supabase or
Resend. The test derives the link from the non-secret invitation UUID plus
the test-only server secret, matching the production HMAC algorithm; the
fake store does not retain the raw token.

```text
pnpm exec playwright test e2e/onboarding.spec.ts

1 passed
workspace creation + invitation + second-context acceptance: 9.7s
total: 22.0s
```

The second context uses the matching invitee email, accepts the single-use
link, opens the organization, and verifies its active member row.

## Files Changed

- `.env.example`
- `package.json`
- `pnpm-lock.yaml`
- `playwright.config.ts`
- `e2e/onboarding.spec.ts`
- `supabase/migrations/202607240003_invitations.sql`
- `supabase/tests/invitations.test.sql`
- `apps/web/package.json`
- `apps/web/vitest.config.ts`
- `apps/web/src/lib/application-origin.ts`
- `apps/web/src/lib/supabase/proxy.ts`
- `apps/web/src/features/auth/actions.ts`
- `apps/web/src/features/workspaces/actions.ts`
- `apps/web/src/features/workspaces/actions.test.ts`
- `apps/web/src/features/workspaces/schemas.ts`
- `apps/web/src/features/workspaces/invitation-token.ts`
- `apps/web/src/features/workspaces/invitation-token.test.ts`
- `apps/web/src/features/workspaces/invitation-email.ts`
- `apps/web/src/features/workspaces/e2e-fake.ts`
- `apps/web/src/features/workspaces/invite-member-form.tsx`
- `apps/web/src/features/workspaces/members-table.tsx`
- `apps/web/src/features/workspaces/accept-invitation-card.tsx`
- `apps/web/src/features/workspaces/onboarding-form.test.tsx`
- `apps/web/src/app/(app)/onboarding/page.tsx`
- `apps/web/src/app/(app)/[organizationId]/layout.tsx`
- `apps/web/src/app/(app)/[organizationId]/settings/members/page.tsx`
- `apps/web/src/app/invitations/[token]/page.tsx`

The unrelated untracked `docs/product-feature-checklist.md` was not
modified or staged.

## Self-Review

- Confirmed invitation storage has no raw token or encrypted-token column.
- Confirmed token values are absent from logging calls.
- Confirmed acceptance hashes the presented token inside SQL.
- Confirmed acceptance reads the authenticated user's normalized email from
  `auth.users`, not caller input.
- Confirmed the invitation row is locked before acceptance, making
  concurrent acceptance single-use.
- Confirmed create/retry/revoke authorization is enforced in the database,
  not only in UI/actions.
- Confirmed retry cannot rotate the token and verifies the reconstructed
  hash before delivery.
- Confirmed Resend idempotency covers ambiguous/repeated submissions.
- Confirmed organization onboarding calls one transactional RPC.
- Confirmed every security-definer function has an empty search path and
  explicit execute grants.
- Confirmed invitation select RLS exposes rows only to organization admins.
- Confirmed the development fake cannot activate in production.
- Confirmed all table columns have proportional width and all status dots
  have visible text.
- Confirmed the user-owned product checklist remains untouched.

## Concerns and Follow-Up

1. Run `supabase db reset && supabase test db` on a machine with Docker or
   PostgreSQL before merging. Grammar parsing cannot execute RLS, locks,
   grants, or pgTAP assertions.
2. Set a generated `INVITATION_TOKEN_SECRET` consistently across all web
   instances. Rotating it invalidates delivery retry reconstruction for
   existing invitations, although already delivered links continue to
   validate from their stored hashes.
3. Configure `RESEND_API_KEY`, a verified
   `INVITATION_FROM_EMAIL`, and `NEXT_PUBLIC_APP_URL` before exercising
   real delivery.
4. Resend idempotency keys are retained by the provider for a finite
   window. The stable key still prevents duplicate sends during the normal
   retry window; operational retry policy should remain within that
   provider guarantee.

## Fix Round 1

### RED Evidence

The focused test command was run before the fixes:

```text
pnpm --filter web test -- workspaces/actions.test.ts workspaces/invitation-token.test.ts workspaces/invitation-presentation.test.ts

3 failed files, 5 passed files
7 failed tests, 28 passed tests
```

The failures covered the missing inviter snapshot RPC argument, retrying a
pending invitation, delivery-status persistence errors, sent-status
monotonicity, cross-admin retry payload drift, UUID case drift, and the
missing invitation presentation helper.

### Invitation Lifecycle Fixes

- `create_invitation` now transactionally revokes an expired, unresolved
  invitation for the same organization/email before inserting its
  replacement. The existing partial unique index continues to reject a
  second active invitation.
- Expired unresolved invitations remain explicitly revocable by an
  organization admin. The members presentation enables revoke for expired
  records while keeping retry disabled.
- Delivery authorization accepts both `pending` and `failed` records, so a
  status-persistence failure has a durable retry route.
- Delivery mark RPC errors and thrown persistence calls are handled
  explicitly. The action returns `pending`, `retryable: true`, and a stable
  recovery message instead of pretending the invitation is failed or
  attempting a contradictory second mark.
- `sent` is an absorbing delivery state in SQL. A late `failed` mark returns
  `sent`, leaves the database status at `sent`, and preserves the provider
  message ID. The TypeScript action honors that final database status.
- Invitation rows snapshot `invited_by_name` and `organization_name`.
  Initial delivery and later retries use those stored values, so another
  admin produces the same recipient, content, acceptance URL, and
  `invitation/{invitationId}` idempotency key.
- Invitation UUIDs are validated and lowercased before HMAC derivation, so
  equivalent upper/lowercase UUID spellings reconstruct the same token.
- The development-only E2E fake mirrors expired replacement, snapshot, and
  pending/failed retry behavior. Its production gate is unchanged.

Invitation storage remains hash-only: the schema stores a 32-byte
`token_hash`, not the raw token or an encrypted-token equivalent.

### SQL Coverage

`supabase/tests/invitations.test.sql` now has a matching `plan(33)` and 33
assertions. Added coverage verifies:

- snapshotted inviter and organization display content;
- expired-record replacement revokes the old row and leaves one active row;
- an expired unresolved invitation can be explicitly revoked by an admin;
- a pending invitation remains eligible for retry authorization;
- a late failed mark cannot overwrite sent status or its provider ID.

Both the migration and pgTAP files parse with `libpg-query`. The migration
still has seven security-definer functions and seven empty search paths.
Docker is not installed in this environment, so the live pgTAP suite could
not be executed; it remains a pre-merge environment check.

### GREEN Evidence

```text
pnpm install --frozen-lockfile
PASS

pnpm --filter web test -- workspaces/actions.test.ts workspaces/invitation-token.test.ts workspaces/invitation-presentation.test.ts
8 files passed, 37 tests passed

pnpm --filter web test
8 files passed, 37 tests passed

pnpm --filter web typecheck
PASS

pnpm --filter web lint
PASS

pnpm check:astryx
PASS

pnpm exec playwright test e2e/onboarding.spec.ts
1 passed

pnpm test
PASS: 3 workspace packages; 8 Astryx convention tests

pnpm typecheck
PASS: 3 workspace packages

pnpm lint
PASS: 3 workspace packages

pnpm build
PASS

git diff --check
PASS
```

The unrelated untracked `docs/product-feature-checklist.md` remained
untouched and is excluded from the Task 4 commit.

## Fix Round 2

This round supersedes the Fix Round 1 expired-replacement semantics.
Expiration does not revoke an invitation and does not authorize creation of
a second token. An unresolved invitation remains the unique active row
until an admin explicitly revokes it.

### RED Evidence

The new fake lifecycle test was run against the Fix Round 1 behavior:

```text
pnpm --filter web test -- src/features/workspaces/e2e-fake.test.ts

1 failed test, 37 passed tests
requires explicit revoke before replacing an expired invitation:
promise resolved instead of rejecting
```

The new static SQL arity test was also run before correcting pgTAP:

```text
node --test scripts/check-sql-function-arities.test.mjs

1 failed test, 2 passed tests
supabase/tests/invitations.test.sql:218:
  public.authorize_invitation_delivery has 4 arguments; expected 3
supabase/tests/invitations.test.sql:260:
  public.authorize_invitation_delivery has 4 arguments; expected 3
```

### Corrections

- Removed automatic expired-row revocation from `create_invitation`.
  The existing unresolved-row unique index now blocks a new invite whether
  the original row is current or expired.
- Removed the mirrored automatic revocation from the development E2E fake.
- Preserved the existing admin UI behavior: expired rows remain visible,
  cannot be retried, and expose an explicit Revoke action.
- Preserved the existing stable create error:
  `An active invitation already exists; revoke it before creating another`.
- Corrected both pgTAP `authorize_invitation_delivery` calls to the declared
  `(uuid, uuid, text)` signature.
- Added a reusable static SQL arity checker and wired it into `pnpm test`.
  The repository gate verifies all six authorization occurrences use three
  arguments and all nine create-invitation occurrences use five arguments.

The pgTAP sequence now proves that an expired unresolved invitation blocks
replacement, remains visible and unrevoked after the blocked attempt, can
be explicitly revoked by an admin, and only then permits a fresh invitation
with different token material. The plan and assertion count both equal 35.

The browser smoke test now additionally proves that a duplicate invite is
blocked, the original row stays present, explicit revoke succeeds, and the
subsequent invite has a different invitation ID before the original
second-browser acceptance flow continues.

### GREEN Evidence

```text
pnpm install --frozen-lockfile
PASS: lockfile up to date

pnpm --filter web test -- src/features/workspaces/e2e-fake.test.ts src/features/workspaces/invitation-presentation.test.ts
9 files passed, 38 tests passed

pnpm test:sql
3 tests passed
public.authorize_invitation_delivery: 6 occurrences use 3 arguments
public.create_invitation: 9 occurrences use 5 arguments

libpg-query parse:
supabase/migrations/202607240003_invitations.sql PASS
supabase/tests/invitations.test.sql PASS

pgTAP static count:
plan(35), 35 assertions

pnpm exec playwright test e2e/onboarding.spec.ts
1 passed in 14.2s

pnpm test
PASS: Astryx 8/8, SQL arity 3/3, workspace packages 3/3,
web 9 files / 38 tests

pnpm typecheck
PASS: 3 workspace packages

pnpm lint
PASS: 3 workspace packages

pnpm build
PASS

git diff --check
PASS
```

Docker is not installed, so live pgTAP execution remains unavailable.
Grammar parsing, static function-arity checks, matching pgTAP plan/count,
and application/E2E verification all pass. The unrelated untracked
`docs/product-feature-checklist.md` remains untouched and excluded.
