# Device Pairing and the Persistent Meld Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user pair their Mac with one command, so a background connector holds an authenticated gateway connection across reboots and can be revoked from the web application.

**Architecture:** A new `packages/device-auth` owns every credential primitive, shared by gateway, web, and scripts. PostgreSQL owns pairing-code lifecycle and redemption atomicity behind `security definer` functions, with redemption the only `anon`-executable function in the schema. A new `apps/connector` package pairs, stores its credential in the macOS Keychain, installs a `launchd` LaunchAgent, and maintains the Task 6 WebSocket protocol with reconnection and lease self-fencing against a stub run.

**Tech Stack:** TypeScript, PostgreSQL/pgTAP, Next.js 16 (App Router), React 19, Astryx Neutral theme, Vitest, Playwright, `ws`, `tsup`, `pnpm` workspaces, `turbo`.

**Spec:** `docs/design/specs/2026-07-28-device-pairing-and-persistent-connector-design.md`

## Global Constraints

- Node `20.19.0`; pnpm `10.28.1`. Dependencies are pinned exactly — no `^` or `~` ranges anywhere.
- Every new SQL function is `security definer`, `set search_path = ''`, fully schema-qualified, followed by `revoke all on function ... from public`, then `revoke ... from anon, authenticated, service_role`, then one explicit `grant execute` to exactly one role.
- Direct `insert`/`update`/`delete` on `device_pairing_codes` is revoked from every role, following Task 6 §6.10.
- Pairing codes are eight Crockford Base32 characters. The alphabet is `0123456789ABCDEFGHJKMNPQRSTVWXYZ` — it excludes `I`, `L`, `O`, and `U`.
- The plaintext pairing code and the plaintext device token each appear in exactly one HTTP response and are never written to a log, a file, or an environment variable.
- No LaunchAgent plist may contain `/usr/local` or `/opt/homebrew`.
- `apps/connector` unit tests must run on Linux CI: every `security` and `launchctl` invocation goes through an injected command runner.
- Existing colocation rules apply — a `foo.ts` gets `foo.test.ts` beside it. `scripts/check-test-colocation.mjs` is extended to `apps/connector` in Task 11.
- New SQL functions must be registered in `scripts/check-sql-arities.mjs`, or `pnpm test:sql` fails.
- Astryx conventions: no literal color functions or raw pixel values in styles. `pnpm check:astryx` enforces this.

---

### Task 1: Extract `packages/device-auth`

**Files:**
- Create: `packages/device-auth/package.json`
- Create: `packages/device-auth/tsconfig.json`
- Create: `packages/device-auth/eslint.config.mjs`
- Create: `packages/device-auth/src/index.ts`
- Create: `packages/device-auth/src/tokens.ts`
- Create: `packages/device-auth/src/tokens.test.ts`
- Create: `packages/device-auth/src/pairing-codes.ts`
- Create: `packages/device-auth/src/pairing-codes.test.ts`
- Delete: `apps/gateway/src/auth/device-token.ts`, `apps/gateway/src/auth/device-token.test.ts`
- Modify: `apps/gateway/package.json`, `apps/gateway/src/auth/device-auth.ts`, `apps/gateway/tsup.config.ts`
- Modify: `scripts/seed-device.ts`
- Modify: `package.json` (root devDependency)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `hashToken(value: string): string`
  - `verifyToken(value: string, digest: string): boolean`
  - `mintDeviceCredential(deviceId: string): { credential: string; tokenHash: string }`
  - `parseDeviceAuthorization(header: string | undefined): { deviceId: string; secret: string } | null`
  - `mintPairingCode(): { code: string; codeHash: string }`
  - `normalizePairingCode(input: string): string`
  - `PAIRING_CODE_ALPHABET`, `PAIRING_CODE_LENGTH`

- [ ] **Step 1: Create the package manifest and config**

`packages/device-auth/package.json`:

```json
{
  "name": "@meld/device-auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@eslint/js": "9.39.5",
    "@types/node": "20.19.43",
    "eslint": "9.39.5",
    "typescript": "5.9.3",
    "typescript-eslint": "8.65.0",
    "vitest": "4.1.10"
  }
}
```

`packages/device-auth/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

Copy `packages/contracts/eslint.config.mjs` to `packages/device-auth/eslint.config.mjs` unchanged.

- [ ] **Step 2: Move the existing token module and its tests**

```bash
git mv apps/gateway/src/auth/device-token.ts packages/device-auth/src/tokens.ts
git mv apps/gateway/src/auth/device-token.test.ts packages/device-auth/src/tokens.test.ts
```

In `tokens.ts`, rename the two exported helpers so they read generically — the same functions now hash pairing codes as well as device secrets:

- `hashDeviceSecret` → `hashToken`
- `verifyDeviceSecret` → `verifyToken`

`mintDeviceCredential` and `parseDeviceAuthorization` keep their names. Update the internal call sites inside `tokens.ts` (`mintDeviceCredential` calls `hashToken`; `verifyToken` calls `hashToken`).

In `tokens.test.ts`, update the import to `./tokens` and the two renamed symbols. Do not change any assertion — this step is a pure move, and the tests passing unchanged is the evidence.

- [ ] **Step 3: Write the failing pairing-code tests**

`packages/device-auth/src/pairing-codes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashToken } from "./tokens";
import {
  mintPairingCode,
  normalizePairingCode,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
} from "./pairing-codes";

describe("pairing codes", () => {
  it("mints eight Crockford Base32 characters with a matching hash", () => {
    const minted = mintPairingCode();

    expect(minted.code).toHaveLength(PAIRING_CODE_LENGTH);
    expect(minted.code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
    expect(minted.codeHash).toBe(hashToken(minted.code));
  });

  it("excludes the ambiguous letters from the alphabet", () => {
    for (const letter of ["I", "L", "O", "U"]) {
      expect(PAIRING_CODE_ALPHABET).not.toContain(letter);
    }
    expect(PAIRING_CODE_ALPHABET).toHaveLength(32);
  });

  it("does not repeat a code across many mints", () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => mintPairingCode().code),
    );

    expect(codes.size).toBe(500);
  });

  it("normalizes separators, whitespace, and case to one value", () => {
    const canonical = normalizePairingCode("ABCD1234");

    expect(normalizePairingCode("abcd-1234")).toBe(canonical);
    expect(normalizePairingCode("  abcd 1234  ")).toBe(canonical);
    expect(normalizePairingCode("ABCD_1234")).toBe(canonical);
  });

  it("folds the letters Crockford substitutes but not U", () => {
    expect(normalizePairingCode("IL0O")).toBe("1100");
    expect(normalizePairingCode("il0o")).toBe("1100");
    // Crockford defines no substitution for U, so it survives normalization
    // and then simply fails to match any stored hash.
    expect(normalizePairingCode("UUUU")).toBe("UUUU");
  });
});
```

- [ ] **Step 4: Run the tests and verify they fail**

Run: `pnpm --filter @meld/device-auth test`
Expected: FAIL — `Failed to resolve import "./pairing-codes"`.

- [ ] **Step 5: Implement pairing codes**

`packages/device-auth/src/pairing-codes.ts`:

```ts
import { randomInt } from "node:crypto";
import { hashToken } from "./tokens";

// Crockford Base32: no I, L, O (visually ambiguous) and no U (obscenity).
export const PAIRING_CODE_ALPHABET =
  "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PAIRING_CODE_LENGTH = 8;

// Crockford's decoding substitutions. U has none: it is simply not a
// legal character, so a code containing one fails to match any hash.
const SUBSTITUTIONS = new Map([
  ["I", "1"],
  ["L", "1"],
  ["O", "0"],
]);

export interface MintedPairingCode {
  code: string;
  codeHash: string;
}

export function mintPairingCode(): MintedPairingCode {
  let code = "";
  for (let index = 0; index < PAIRING_CODE_LENGTH; index += 1) {
    code += PAIRING_CODE_ALPHABET[
      randomInt(PAIRING_CODE_ALPHABET.length)
    ];
  }

  return { code, codeHash: hashToken(code) };
}

export function normalizePairingCode(input: string): string {
  const upper = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  let normalized = "";
  for (const character of upper) {
    normalized += SUBSTITUTIONS.get(character) ?? character;
  }
  return normalized;
}
```

`randomInt` rather than `Math.random`: a pairing code is a bearer credential, and a predictable one is guessable.

`packages/device-auth/src/index.ts`:

```ts
export {
  hashToken,
  mintDeviceCredential,
  parseDeviceAuthorization,
  verifyToken,
  type MintedDeviceCredential,
  type ParsedDeviceCredential,
} from "./tokens";
export {
  mintPairingCode,
  normalizePairingCode,
  PAIRING_CODE_ALPHABET,
  PAIRING_CODE_LENGTH,
  type MintedPairingCode,
} from "./pairing-codes";
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `pnpm --filter @meld/device-auth test`
Expected: PASS — both `tokens.test.ts` (moved, unchanged assertions) and `pairing-codes.test.ts`.

- [ ] **Step 7: Point the gateway at the new package**

Add to `apps/gateway/package.json` dependencies, keeping alphabetical order:

```json
"@meld/device-auth": "workspace:*",
```

In `apps/gateway/src/auth/device-auth.ts`, replace the import:

```ts
import * as deviceToken from "@meld/device-auth";
```

and rename the one call: `deviceToken.verifyDeviceSecret(...)` → `deviceToken.verifyToken(...)`.

In `apps/gateway/tsup.config.ts`, add `@meld/device-auth` alongside `@meld/contracts` in `noExternal`, so the bundle inlines it. Both packages export TypeScript directly, so an un-inlined import would fail at runtime.

- [ ] **Step 8: Point the seed script at the new package**

In `scripts/seed-device.ts`, replace:

```ts
import { mintDeviceCredential } from "../apps/gateway/src/auth/device-token";
```

with:

```ts
import { mintDeviceCredential } from "@meld/device-auth";
```

Add `"@meld/device-auth": "workspace:*"` to the root `package.json` devDependencies, beside the existing `@meld/contracts` entry — the root scripts resolve their workspace imports from there.

- [ ] **Step 9: Install and verify the whole workspace still passes**

```bash
pnpm install
pnpm --filter @meld/gateway test
pnpm typecheck
pnpm lint
```

Expected: all PASS. The gateway suite passing after an import-only change is the proof that the extraction was behaviour-neutral.

- [ ] **Step 10: Commit**

```bash
git add packages/device-auth apps/gateway scripts/seed-device.ts package.json pnpm-lock.yaml
git commit -m "refactor: extract shared device credential primitives"
```

---

### Task 2: Pairing schema and database functions

**Files:**
- Create: `supabase/migrations/202607280002_device_pairing.sql`
- Create: `supabase/tests/device_pairing.test.sql`
- Modify: `scripts/check-sql-arities.mjs`

**Interfaces:**
- Consumes: Task 1's hashing (the callers hash before calling; SQL receives hashes only).
- Produces:
  - `public.create_device_pairing_code(target_code_hash text, target_requested_provider public.provider) returns timestamptz`
  - `public.redeem_device_pairing_code(target_code_hash text, target_device_id uuid, target_token_hash text, target_platform text, target_name text) returns table (user_id uuid, requested_provider public.provider)`
  - `public.revoke_execution_device(target_device_id uuid) returns void`
  - `public.list_execution_devices() returns table (...)`
  - `public.record_device_connection(uuid, text) returns public.execution_device_status` — altered

- [ ] **Step 1: Write the failing pgTAP tests**

Create `supabase/tests/device_pairing.test.sql`. Follow the header, `plan()`, and fixture style of `supabase/tests/ai_task_transitions.test.sql` exactly — read that file first and mirror its role-switching helpers.

Cover, one assertion per behaviour:

```sql
-- create_device_pairing_code
select lives_ok(
  $$ select public.create_device_pairing_code('a1', 'codex') $$,
  'a signed-in user may create a pairing code'
);
select is(
  (select user_id from public.device_pairing_codes where code_hash = 'a1'),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'the code belongs to auth.uid(), not to any supplied value'
);
select ok(
  (select expires_at from public.device_pairing_codes where code_hash = 'a1')
    between now() + interval '9 minutes' and now() + interval '10 minutes',
  'codes expire ten minutes after creation'
);
select throws_ok(
  $$ select public.create_device_pairing_code('a7', 'codex') $$,
  'P0001',
  'too_many_pairing_codes',
  'a sixth live code is refused'
);

-- redeem_device_pairing_code, from anon
select throws_ok(
  $$ select public.redeem_device_pairing_code('missing', ..., 'darwin', 'Mac') $$,
  'P0001', 'invalid_pairing_code', 'an unknown code is refused'
);
-- ... identical error text for an expired code
-- ... identical error text for an already-redeemed code
select is(
  (select count(*) from public.execution_devices where id = <device>),
  1::bigint,
  'redemption creates the device row'
);
select is(
  (select user_id from public.execution_devices where id = <device>),
  <code owner>,
  'the device belongs to the code owner, not the anonymous caller'
);
select is(
  (select count(*) from public.provider_connections where device_id = <device>),
  0::bigint,
  'redemption creates no provider connection'
);

-- privileges
select throws_ok(
  $$ insert into public.device_pairing_codes (user_id, code_hash, requested_provider, expires_at)
     values (...) $$,
  '42501', null, 'authenticated cannot insert pairing codes directly'
);
-- ... same for service_role
select function_privs_are(
  'public', 'redeem_device_pairing_code',
  array['text','uuid','text','text','text'],
  'anon', array['EXECUTE'],
  'anon may execute redemption'
);
select function_privs_are(
  'public', 'create_device_pairing_code', array['text','public.provider'],
  'anon', array[]::text[],
  'anon may execute nothing else'
);

-- revoke_execution_device
select throws_ok(
  $$ select public.revoke_execution_device(<other user device>) $$,
  'P0001', 'invalid_execution_device',
  'a user cannot revoke another user''s device'
);
select lives_ok(
  $$ select public.revoke_execution_device(<own device>);
     select public.revoke_execution_device(<own device>) $$,
  'revocation is idempotent'
);

-- record_device_connection now reports rather than raises
select is(
  public.record_device_connection(<revoked device>, 'v1'),
  'revoked'::public.execution_device_status,
  'a revoked device reports its status instead of raising'
);
```

Update `plan(N)` to the exact assertion count.

- [ ] **Step 2: Register the new function arities**

In `scripts/check-sql-arities.mjs`, append to `SQL_FUNCTION_ARITIES`:

```js
{
  functionName: "public.create_device_pairing_code",
  arity: 2,
  files: [
    "supabase/migrations/202607280002_device_pairing.sql",
    "supabase/tests/device_pairing.test.sql",
  ],
},
{
  functionName: "public.redeem_device_pairing_code",
  arity: 5,
  files: [
    "supabase/migrations/202607280002_device_pairing.sql",
    "supabase/tests/device_pairing.test.sql",
  ],
},
{
  functionName: "public.revoke_execution_device",
  arity: 1,
  files: [
    "supabase/migrations/202607280002_device_pairing.sql",
    "supabase/tests/device_pairing.test.sql",
  ],
},
{
  functionName: "public.list_execution_devices",
  arity: 0,
  files: [
    "supabase/migrations/202607280002_device_pairing.sql",
    "supabase/tests/device_pairing.test.sql",
  ],
},
```

`record_device_connection` is deliberately not listed: `202607280002_device_pairing.sql` contains both a `drop function` and a `create function` at the same arity, but the existing `202607280001_ai_tasks.sql` entry would then need to cover two files with different intent. Follow the `create_invitation` precedent already documented in that file's header comment, and add a comment saying so.

- [ ] **Step 3: Run the tests and verify they fail**

```bash
supabase db reset
supabase test db
```

Expected: FAIL — `relation "public.device_pairing_codes" does not exist`.

- [ ] **Step 4: Write the migration — table**

`supabase/migrations/202607280002_device_pairing.sql`:

```sql
create table public.device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null unique
    check (code_hash ~ '^[a-f0-9]{64}$'),
  requested_provider public.provider not null,
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_device_id uuid references public.execution_devices (id)
    on delete set null,
  created_at timestamptz not null default now(),
  constraint device_pairing_codes_redemption_is_paired check (
    (redeemed_at is null) = (redeemed_device_id is null)
  )
);

create index device_pairing_codes_user_id_idx
  on public.device_pairing_codes (user_id);

alter table public.device_pairing_codes enable row level security;

revoke all on table public.device_pairing_codes from public;
revoke insert, update, delete on table public.device_pairing_codes
  from anon, authenticated, service_role;
```

The check constraint makes "redeemed" and "which device it produced" inseparable at the schema level, so no function can record half a redemption.

- [ ] **Step 5: Write the migration — `create_device_pairing_code`**

```sql
create function public.create_device_pairing_code(
  target_code_hash text,
  target_requested_provider public.provider
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  live_codes integer;
  new_expires_at timestamptz := now() + interval '10 minutes';
begin
  if caller_id is null then
    raise exception 'authentication_required' using errcode = 'P0001';
  end if;

  delete from public.device_pairing_codes
  where user_id = caller_id
    and (expires_at <= now() or redeemed_at is not null);

  select count(*) into live_codes
  from public.device_pairing_codes
  where user_id = caller_id;

  if live_codes >= 5 then
    raise exception 'too_many_pairing_codes' using errcode = 'P0001';
  end if;

  insert into public.device_pairing_codes (
    user_id, code_hash, requested_provider, expires_at
  )
  values (
    caller_id, target_code_hash, target_requested_provider, new_expires_at
  );

  return new_expires_at;
end;
$$;

revoke all on function public.create_device_pairing_code(
  text, public.provider
) from public;
revoke all on function public.create_device_pairing_code(
  text, public.provider
) from anon, authenticated, service_role;
grant execute on function public.create_device_pairing_code(
  text, public.provider
) to authenticated;
```

- [ ] **Step 6: Write the migration — `redeem_device_pairing_code`**

```sql
create function public.redeem_device_pairing_code(
  target_code_hash text,
  target_device_id uuid,
  target_token_hash text,
  target_platform text,
  target_name text
)
returns table (user_id uuid, requested_provider public.provider)
language plpgsql
security definer
set search_path = ''
as $$
declare
  code_row public.device_pairing_codes;
begin
  select * into code_row
  from public.device_pairing_codes as code
  where code.code_hash = target_code_hash
  for update;

  -- Unknown, expired, and already-redeemed are one error on purpose: a
  -- distinguishable response would confirm which guesses hit a real code.
  if code_row.id is null
     or code_row.expires_at <= now()
     or code_row.redeemed_at is not null then
    raise exception 'invalid_pairing_code' using errcode = 'P0001';
  end if;

  insert into public.execution_devices (
    id, user_id, name, platform, token_hash, status
  )
  values (
    target_device_id,
    code_row.user_id,
    left(coalesce(nullif(target_name, ''), 'Meld connector'), 100),
    left(target_platform, 50),
    target_token_hash,
    'active'
  );

  update public.device_pairing_codes
  set redeemed_at = now(),
      redeemed_device_id = target_device_id
  where id = code_row.id;

  return query select code_row.user_id, code_row.requested_provider;
end;
$$;

revoke all on function public.redeem_device_pairing_code(
  text, uuid, text, text, text
) from public;
revoke all on function public.redeem_device_pairing_code(
  text, uuid, text, text, text
) from anon, authenticated, service_role;
grant execute on function public.redeem_device_pairing_code(
  text, uuid, text, text, text
) to anon;
```

Add a comment above the grant recording *why* `anon` appears here at all — the connector holds no Supabase session, so pairing is the credential bootstrap and no narrower grant exists.

- [ ] **Step 7: Write the migration — revocation, listing, and the `record_device_connection` alteration**

```sql
create function public.revoke_execution_device(target_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
begin
  update public.execution_devices
  set status = 'revoked',
      revoked_at = coalesce(revoked_at, now())
  where id = target_device_id
    and user_id = caller_id;

  if not found then
    raise exception 'invalid_execution_device' using errcode = 'P0001';
  end if;
end;
$$;
```

`coalesce(revoked_at, now())` is what makes a repeated revocation idempotent rather than resetting the timestamp.

`list_execution_devices()` returns the caller's devices for the management UI, granted to `authenticated`:

```sql
create function public.list_execution_devices()
returns table (
  id uuid,
  name text,
  platform text,
  status public.execution_device_status,
  connector_version text,
  last_seen_at timestamptz,
  created_at timestamptz,
  providers jsonb
)
```

filtered on `user_id = auth.uid()`, with `providers` aggregated from `provider_connections` via `jsonb_agg`. A function rather than a select-with-RLS because the join must not expose another user's connection rows. Add a pgTAP assertion in Step 1 that it returns only the caller's devices.

Then replace `record_device_connection`:

```sql
drop function public.record_device_connection(uuid, text);

create function public.record_device_connection(
  target_device_id uuid,
  target_connector_version text
)
returns public.execution_device_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.execution_device_status;
begin
  select status into current_status
  from public.execution_devices
  where id = target_device_id;

  if current_status is null then
    raise exception 'invalid_execution_device' using errcode = 'P0001';
  end if;

  -- Only an active device advances liveness; a revoked one is reported so
  -- the gateway can close its socket deliberately (design §10.1).
  if current_status = 'active' then
    update public.execution_devices
    set last_seen_at = now(),
        connector_version = left(target_connector_version, 100)
    where id = target_device_id;
  end if;

  return current_status;
end;
$$;
```

Re-apply the same revoke/grant block the original had, granting to `service_role`.

- [ ] **Step 8: Run the tests and verify they pass**

```bash
supabase db reset
supabase test db
pnpm test:sql
```

Expected: all PASS, including the pre-existing `ai_task_transitions.test.sql`.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/202607280002_device_pairing.sql \
        supabase/tests/device_pairing.test.sql \
        scripts/check-sql-arities.mjs
git commit -m "feat: add device pairing schema and authorized functions"
```

---

### Task 3: Close revoked devices' open sockets

**Files:**
- Modify: `apps/gateway/src/tasks/task-repository.ts`
- Modify: `apps/gateway/src/tasks/task-repository.test.ts`
- Modify: `apps/gateway/src/ws/protocol-handler.ts`
- Modify: `apps/gateway/src/ws/protocol-handler.test.ts`
- Modify: `apps/gateway/src/auth/device-auth.ts`

**Interfaces:**
- Consumes: Task 2's altered `record_device_connection`.
- Produces: `TaskRepository.recordDeviceConnection(deviceId, connectorVersion): Promise<ExecutionDeviceStatus>` where `ExecutionDeviceStatus = "active" | "revoked"`.

- [ ] **Step 1: Write the failing protocol-handler test**

In `apps/gateway/src/ws/protocol-handler.test.ts`, beside the existing heartbeat tests:

```ts
it("closes the socket when a heartbeat reports a revoked device", async () => {
  const repository = createRepositoryDouble();
  repository.recordDeviceConnection = vi.fn().mockResolvedValue("revoked");
  const session = createSessionDouble();
  const handler = createProtocolHandler({ repository });

  await handler.handle(
    session,
    frame({
      type: "heartbeat",
      connectorVersion: "connector/1.0.0",
      activeTasks: [],
    }),
  );

  expect(session.close).toHaveBeenCalledWith(1008, "device_revoked");
  expect(repository.renewTaskLeases).not.toHaveBeenCalled();
  expect(session.send).not.toHaveBeenCalled();
});
```

Match the existing file's helper names (`createRepositoryDouble`, `frame`, and so on) rather than introducing new ones — read the surrounding tests first.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @meld/gateway test -- src/ws/protocol-handler.test.ts`
Expected: FAIL — the socket is not closed, and `renewTaskLeases` is called.

- [ ] **Step 3: Return the status from the repository**

In `apps/gateway/src/tasks/task-repository.ts`, export the status type and change the wrapper:

```ts
export type ExecutionDeviceStatus = "active" | "revoked";

async recordDeviceConnection(
  deviceId: string,
  connectorVersion: string,
): Promise<ExecutionDeviceStatus> {
  return rpc<ExecutionDeviceStatus>("record_device_connection", {
    target_device_id: deviceId,
    target_connector_version: connectorVersion,
  });
},
```

- [ ] **Step 4: Close the socket in the handler**

In `apps/gateway/src/ws/protocol-handler.ts`, add the reason constant beside the existing ones:

```ts
const REVOKED_DEVICE_REASON = "device_revoked";
```

and change the heartbeat case:

```ts
case "heartbeat": {
  session.markHeartbeat();
  const status = await repository.recordDeviceConnection(
    session.deviceId,
    message.connectorVersion,
  );
  // Revocation cannot reach an already-open socket any other way: the
  // device authenticated once, at upgrade (design §10.1).
  if (status !== "active") {
    session.close(1008, REVOKED_DEVICE_REASON);
    return;
  }
  const renewedTasks = await repository.renewTaskLeases(
    session.deviceId,
    message.activeTasks,
  );
  session.send({ type: "heartbeat.ack", renewedTasks });
  return;
}
```

- [ ] **Step 5: Keep `device-auth` correct**

`authenticateDevice` calls `recordDeviceConnection` after verifying the device is `active`, so its return value is unused there. Leave the call as is — but confirm the changed return type does not break the `DeviceAuthRepository` `Pick<>`. If `apps/gateway/src/auth/device-auth.test.ts` stubs `recordDeviceConnection` with `mockResolvedValue(undefined)`, update those stubs to `mockResolvedValue("active")`.

- [ ] **Step 6: Run the gateway suite and verify it passes**

```bash
pnpm --filter @meld/gateway test
pnpm --filter @meld/gateway typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/gateway/src
git commit -m "fix: close sockets held by revoked devices"
```

---

### Task 4: Web API for pairing codes, redemption, and revocation

**Files:**
- Create: `apps/web/src/features/ai/device-service.ts`
- Create: `apps/web/src/features/ai/device-service.test.ts`
- Create: `apps/web/src/features/ai/pair-rate-limit.ts`
- Create: `apps/web/src/features/ai/pair-rate-limit.test.ts`
- Create: `apps/web/src/app/api/devices/pairing-codes/route.ts`
- Create: `apps/web/src/app/api/devices/pairing-codes/route.test.ts`
- Create: `apps/web/src/app/api/devices/pair/route.ts`
- Create: `apps/web/src/app/api/devices/pair/route.test.ts`
- Create: `apps/web/src/app/api/devices/[deviceId]/revoke/route.ts`
- Create: `apps/web/src/app/api/devices/[deviceId]/revoke/route.test.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Consumes: Task 1 (`mintPairingCode`, `normalizePairingCode`, `hashToken`, `mintDeviceCredential`), Task 2's RPCs.
- Produces:
  - `createPairingCode(supabase, { requestedProvider }): Promise<{ code: string; expiresAt: string }>`
  - `redeemPairingCode(supabase, { code, platform, name }): Promise<{ deviceId: string; deviceToken: string; requestedProvider: Provider }>`
  - `listDevices(supabase): Promise<DeviceSummary[]>`
  - `revokeDevice(supabase, deviceId): Promise<void>`
  - `consumePairAttempt(key: string): { allowed: boolean }`, `recordPairFailure(key: string): void`, `resetPairRateLimit(): void`, and the `PER_KEY_FAILURE_LIMIT` / `GLOBAL_FAILURE_LIMIT` constants
  - `POST /api/devices/pairing-codes`, `POST /api/devices/pair`, `POST /api/devices/[deviceId]/revoke`

- [ ] **Step 1: Add the dependency**

Add `"@meld/device-auth": "workspace:*"` to `apps/web/package.json` dependencies, then `pnpm install`.

- [ ] **Step 2: Write the failing rate-limiter tests**

`apps/web/src/features/ai/pair-rate-limit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GLOBAL_FAILURE_LIMIT,
  PER_KEY_FAILURE_LIMIT,
  consumePairAttempt,
  recordPairFailure,
  resetPairRateLimit,
} from "./pair-rate-limit";

describe("pair rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetPairRateLimit();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts until the per-key failure limit is reached", () => {
    for (let attempt = 0; attempt < PER_KEY_FAILURE_LIMIT; attempt += 1) {
      expect(consumePairAttempt("1.2.3.4").allowed).toBe(true);
      recordPairFailure("1.2.3.4");
    }

    expect(consumePairAttempt("1.2.3.4").allowed).toBe(false);
    expect(consumePairAttempt("5.6.7.8").allowed).toBe(true);
  });

  it("forgets failures once the window passes", () => {
    for (let attempt = 0; attempt < PER_KEY_FAILURE_LIMIT; attempt += 1) {
      recordPairFailure("1.2.3.4");
    }
    expect(consumePairAttempt("1.2.3.4").allowed).toBe(false);

    vi.advanceTimersByTime(10 * 60 * 1000 + 1);

    expect(consumePairAttempt("1.2.3.4").allowed).toBe(true);
  });

  it("blocks every key once the global failure limit is reached", () => {
    for (let attempt = 0; attempt < GLOBAL_FAILURE_LIMIT; attempt += 1) {
      recordPairFailure(`key-${attempt}`);
    }

    expect(consumePairAttempt("fresh-key").allowed).toBe(false);
  });

  it("does not count successful redemptions", () => {
    for (let attempt = 0; attempt < PER_KEY_FAILURE_LIMIT * 2; attempt += 1) {
      expect(consumePairAttempt("1.2.3.4").allowed).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Write the failing device-service tests**

`apps/web/src/features/ai/device-service.test.ts` — follow the Supabase-double style already used in `task-service.test.ts`. Assert:

- `createPairingCode` calls `create_device_pairing_code` with a **hash**, never the plaintext, and returns the plaintext exactly once.
- `redeemPairingCode` normalizes before hashing, so `abcd-1234` and `ABCD1234` produce the same `target_code_hash`.
- `redeemPairingCode` returns the plaintext token and passes only its hash to the RPC.
- `redeemPairingCode` surfaces `invalid_pairing_code` as a typed error the route can map.
- `revokeDevice` calls `revoke_execution_device` with the device ID.

- [ ] **Step 4: Write the failing route tests**

`apps/web/src/app/api/devices/pair/route.test.ts` asserts the properties that matter most:

```ts
it("returns identical responses for unknown, expired, and redeemed codes", async () => {
  const responses = await Promise.all(
    ["unknown", "expired", "redeemed"].map((variant) =>
      POST(pairRequest({ code: "ABCD1234" }, variant)),
    ),
  );

  const bodies = await Promise.all(responses.map((r) => r.text()));
  expect(new Set(responses.map((r) => r.status))).toEqual(new Set([400]));
  expect(new Set(bodies).size).toBe(1);
});

it("returns 429 once the rate limit is exhausted", async () => { /* ... */ });

it("returns the device token exactly once and never logs it", async () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await POST(pairRequest({ code: "ABCD1234" }));
  const body = await response.json();

  expect(body.deviceToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  for (const call of errorSpy.mock.calls) {
    expect(JSON.stringify(call)).not.toContain(body.deviceToken);
  }
});
```

`pairing-codes/route.test.ts` asserts a missing session returns `401` before any RPC runs. `[deviceId]/revoke/route.test.ts` asserts the same, plus that a `invalid_execution_device` error maps to `404`.

- [ ] **Step 5: Run the tests and verify they fail**

Run: `pnpm --filter @meld/web test`
Expected: FAIL — the modules do not exist.

- [ ] **Step 6: Implement the rate limiter**

`apps/web/src/features/ai/pair-rate-limit.ts`. Two `Map`s of timestamp arrays, pruned on read, with a ten-minute window:

```ts
export const PER_KEY_FAILURE_LIMIT = 10;
export const GLOBAL_FAILURE_LIMIT = 200;
const WINDOW_MS = 10 * 60 * 1000;
```

Document at the top of the file that this is in-process, matching the single-instance constraint the gateway design §9.4 already accepts, and that horizontal scaling degrades the ceiling per-instance rather than removing it.

- [ ] **Step 7: Implement the device service and routes**

`device-service.ts` mirrors `task-service.ts`: Zod input schemas, thin RPC wrappers, typed errors. The redemption path is:

```ts
const normalized = normalizePairingCode(input.code);
const deviceId = randomUUID();
const minted = mintDeviceCredential(deviceId);
const { data, error } = await supabase.rpc("redeem_device_pairing_code", {
  target_code_hash: hashToken(normalized),
  target_device_id: deviceId,
  target_token_hash: minted.tokenHash,
  target_platform: input.platform,
  target_name: input.name,
});
```

Return `minted.credential.split(".")[1]` as `deviceToken`. The routes follow the exact shape of `apps/web/src/app/api/ai/tasks/route.ts` — `createClient(responseHeaders)`, `getClaims()`, Zod parse, one try/catch mapping to a status.

`/api/devices/pair` skips the auth check, calls `consumePairAttempt` first using `x-forwarded-for` (falling back to a constant when absent), and calls `recordPairFailure` on every failure path.

- [ ] **Step 8: Run the tests and verify they pass**

```bash
pnpm --filter @meld/web test
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/ai apps/web/src/app/api/devices apps/web/package.json pnpm-lock.yaml
git commit -m "feat: expose pairing code and device revocation APIs"
```

---

### Task 5: Onboarding and device-management UI

**Files:**
- Create: `apps/web/src/features/ai/e2e-gate.ts`
- Create: `apps/web/src/features/ai/e2e-fake.ts`
- Create: `apps/web/src/features/ai/e2e-fake.test.ts`
- Create: `apps/web/src/features/ai/components/connect-device.tsx`
- Create: `apps/web/src/features/ai/components/connect-device.test.tsx`
- Create: `apps/web/src/features/ai/components/device-list.tsx`
- Create: `apps/web/src/features/ai/components/device-list.test.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/settings/devices/page.tsx`

**Interfaces:**
- Consumes: Task 4's routes and `listDevices`.
- Produces: `isDeviceFakeEnabled()`, `<ConnectDevice />`, `<DeviceList />`, and the `/[organizationId]/settings/devices` route.

- [ ] **Step 1: Generate the Astryx components first**

```bash
pnpm exec astryx build "connector setup page with copyable terminal command, pairing code, provider selection, connection status, and troubleshooting"
pnpm exec astryx component CodeBlock
pnpm exec astryx component StatusDot
pnpm exec astryx component Button
pnpm exec astryx component Banner
```

Use the resulting components with the Neutral theme. Do not hand-write colors or pixel values — `pnpm check:astryx` rejects both.

- [ ] **Step 2: Write the failing component tests**

`connect-device.test.tsx` asserts, with Testing Library:

- selecting **Codex** and selecting **Claude** are both possible, and neither is disabled, labelled "coming soon", or hidden behind a flag;
- after selection the pairing code renders and the command block contains `pnpm --filter @meld/connector cli -- pair --join` followed by that code;
- the disclosure copy names the install location, background behavior, Keychain storage, and how to remove it, and states that Xcode, Homebrew, `sudo`, and an open Terminal are not required;
- once expiry passes, the code is replaced by a **Generate a new code** action.

`device-list.test.tsx` asserts a device row shows name, platform, connector version, last-seen, and provider status; that **Revoke** opens a confirmation naming the consequence; and that confirming calls the revoke endpoint and removes the row.

- [ ] **Step 3: Run the tests and verify they fail**

Run: `pnpm --filter @meld/web test -- src/features/ai/components`
Expected: FAIL — the components do not exist.

- [ ] **Step 4: Implement the E2E gate and fake**

`e2e-gate.ts` mirrors `apps/web/src/features/workspaces/e2e-gate.ts` exactly:

```ts
// Kept separate from e2e-fake.ts so callers can read the gate without
// statically importing the fake -- and pulling its in-memory store into
// the real bundle. Mirrors workspaces/e2e-gate.ts.
export function isDeviceFakeEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MELD_E2E_FAKE_DEVICES === "true"
  );
}
```

`e2e-fake.ts` holds an in-memory device list and a fixed pairing code, so Playwright never needs a database.

Write `e2e-fake.test.ts` beside it, following `apps/web/src/features/workspaces/e2e-fake.test.ts` — read that file and match its `vi.stubEnv` structure:

```ts
it("serves fake devices only when the gate is on", async () => {
  vi.stubEnv("MELD_E2E_FAKE_DEVICES", "true");
  expect(isDeviceFakeEnabled()).toBe(true);

  vi.stubEnv("MELD_E2E_FAKE_DEVICES", "false");
  expect(isDeviceFakeEnabled()).toBe(false);
});

it("never enables the fake in production", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("MELD_E2E_FAKE_DEVICES", "true");

  expect(isDeviceFakeEnabled()).toBe(false);
});
```

The second case is the one that matters: the gate is what keeps an in-memory device list out of a production bundle.

- [ ] **Step 5: Implement the components and page**

`connect-device.tsx` is a client component holding provider selection and fetched-code state. `device-list.tsx` renders the list with a revoke confirmation. The page is a server component that reads devices through `listDevices` (or the fake, per the gate) and renders both.

Neither polls for connector arrival — live status is Task 10's, and a bespoke poller here would be replaced by it.

- [ ] **Step 6: Run the tests and verify they pass**

```bash
pnpm --filter @meld/web test
pnpm check:astryx
pnpm --filter @meld/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/ai apps/web/src/app/\(app\)
git commit -m "feat: add device pairing and management screens"
```

---

### Task 6: Connector package, paths, and LaunchAgent

**Files:**
- Create: `apps/connector/package.json`, `apps/connector/tsconfig.json`, `apps/connector/eslint.config.mjs`, `apps/connector/vitest.config.ts`, `apps/connector/tsup.config.ts`
- Create: `apps/connector/src/config/paths.ts` and `paths.test.ts`
- Create: `apps/connector/src/launchd/command-runner.ts` and `command-runner.test.ts`
- Create: `apps/connector/src/launchd/launch-agent.ts` and `launch-agent.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces:
  - `connectorPaths(home: string): ConnectorPaths` with `root`, `bundleDir`, `agentEntry`, `configFile`, `logFile`, `plistFile`, `launchLabel`
  - `CommandRunner` — `run(command: string, args: string[]): Promise<{ stdout: string; code: number }>`
  - `renderLaunchAgent(paths: ConnectorPaths, nodePath: string): string`
  - `installLaunchAgent(paths, nodePath, runner)`, `uninstallLaunchAgent(paths, runner)`, `isLaunchAgentLoaded(paths, runner)`

- [ ] **Step 1: Create the package**

`apps/connector/package.json`:

```json
{
  "name": "@meld/connector",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsup",
    "cli": "tsx src/cli.ts",
    "lint": "eslint",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@meld/contracts": "workspace:*",
    "@meld/device-auth": "workspace:*",
    "ws": "8.21.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "9.39.5",
    "@types/node": "20.19.43",
    "@types/ws": "8.18.1",
    "eslint": "9.39.5",
    "tsup": "8.5.1",
    "tsx": "4.23.1",
    "typescript": "5.9.3",
    "typescript-eslint": "8.65.0",
    "vitest": "4.1.10"
  }
}
```

Copy `apps/gateway/tsconfig.json`, `eslint.config.mjs`, and `vitest.config.ts` unchanged. `tsup.config.ts` mirrors the gateway's, with entries `src/agent.ts` and `src/cli.ts`, ESM output, and `noExternal: ["@meld/contracts", "@meld/device-auth"]`.

Run `pnpm install`.

- [ ] **Step 2: Write the failing paths and plist tests**

`apps/connector/src/config/paths.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { connectorPaths } from "./paths";

describe("connector paths", () => {
  it("places everything under Meld's Application Support directory", () => {
    const paths = connectorPaths("/Users/ada");

    expect(paths.root).toBe("/Users/ada/Library/Application Support/Meld");
    expect(paths.bundleDir).toBe(
      "/Users/ada/Library/Application Support/Meld/connector/current",
    );
    expect(paths.agentEntry).toBe(
      "/Users/ada/Library/Application Support/Meld/connector/current/agent.mjs",
    );
    expect(paths.configFile).toBe(
      "/Users/ada/Library/Application Support/Meld/config.json",
    );
    expect(paths.logFile).toBe(
      "/Users/ada/Library/Application Support/Meld/logs/agent.log",
    );
    expect(paths.plistFile).toBe(
      "/Users/ada/Library/LaunchAgents/com.meld.agent.plist",
    );
    expect(paths.launchLabel).toBe("com.meld.agent");
  });
});
```

`apps/connector/src/launchd/launch-agent.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { connectorPaths } from "../config/paths";
import { installLaunchAgent, renderLaunchAgent } from "./launch-agent";

const PATHS = connectorPaths("/Users/ada");
const NODE_PATH = "/Users/ada/.nvm/versions/node/v20.19.0/bin/node";

describe("LaunchAgent", () => {
  it("runs the installed bundle at load and restarts it", () => {
    const plist = renderLaunchAgent(PATHS, NODE_PATH);

    expect(plist).toContain("<string>com.meld.agent</string>");
    expect(plist).toContain(`<string>${NODE_PATH}</string>`);
    expect(plist).toContain(`<string>${PATHS.agentEntry}</string>`);
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toContain(PATHS.logFile);
  });

  it("never references a package manager's directories", () => {
    const plist = renderLaunchAgent(PATHS, NODE_PATH);

    expect(plist).not.toContain("/usr/local");
    expect(plist).not.toContain("/opt/homebrew");
  });

  it("replaces any previously loaded agent before loading", async () => {
    const runner = { run: vi.fn().mockResolvedValue({ stdout: "", code: 0 }) };

    await installLaunchAgent(PATHS, NODE_PATH, runner);

    const commands = runner.run.mock.calls.map(([, args]) => args[0]);
    expect(commands).toEqual(["bootout", "bootstrap"]);
  });

  it("treats bootout of a not-loaded agent as success", async () => {
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "No such process", code: 3 })
        .mockResolvedValueOnce({ stdout: "", code: 0 }),
    };

    await expect(
      installLaunchAgent(PATHS, NODE_PATH, runner),
    ).resolves.toBeUndefined();
  });
});
```

That last case matters: a first-time install has nothing to boot out, and `launchctl` exits non-zero for it.

- [ ] **Step 3: Run the tests and verify they fail**

Run: `pnpm --filter @meld/connector test`
Expected: FAIL — the modules do not exist.

- [ ] **Step 4: Implement paths, the command runner, and the LaunchAgent**

`paths.ts` takes `home` as an argument — no `os.homedir()` inside — so tests assert exact strings without touching a real filesystem.

`command-runner.ts` exports the `CommandRunner` interface and a `nodeCommandRunner` built on `execFile`, never a shell, so no argument can be interpreted as a command.

`launch-agent.ts` renders the plist and drives `launchctl bootout gui/$UID/com.meld.agent` then `launchctl bootstrap gui/$UID <plist>`, tolerating bootout failure.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm --filter @meld/connector test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/connector pnpm-lock.yaml
git commit -m "feat: scaffold the connector package with LaunchAgent support"
```

---

### Task 7: Keychain store and pairing client

**Files:**
- Create: `apps/connector/src/pairing/credential-store.ts` and `credential-store.test.ts`
- Create: `apps/connector/src/pairing/keychain-store.ts` and `keychain-store.test.ts`
- Create: `apps/connector/src/pairing/pairing-client.ts` and `pairing-client.test.ts`

**Interfaces:**
- Consumes: Task 6's `CommandRunner`, Task 4's `POST /api/devices/pair`.
- Produces:
  - `CredentialStore` — `save(c)`, `read()`, `delete()`, `probe()`
  - `MemoryCredentialStore` (test and integration double)
  - `KeychainStore(runner)` 
  - `PairingClient({ baseUrl, credentialStore, fetch })` with `pair(code): Promise<{ deviceId: string; requestedProvider: Provider }>`

- [ ] **Step 1: Write the failing Keychain tests**

`keychain-store.test.ts` drives a fake `CommandRunner` and asserts:

- `save` invokes `/usr/bin/security add-generic-password` with `-U`, service `com.meld.agent`, and the device ID as the account;
- `read` returns the secret `find-generic-password -w` prints, trimmed of its trailing newline;
- `read` resolves `null` — rather than throwing — when `security` exits `44` (item not found);
- a non-zero exit that is *not* 44 throws, so a real Keychain fault is never mistaken for an absent credential;
- `probe()` writes a throwaway entry under a distinct account and deletes it, and reports `false` if either step fails.

- [ ] **Step 2: Write the failing pairing-client tests**

```ts
it("stores the returned device token and never returns it to callers", async () => {
  const store = new MemoryCredentialStore();
  const client = new PairingClient({
    baseUrl: "http://127.0.0.1:3000",
    credentialStore: store,
    fetch: fakeFetch({
      deviceId: "40000000-0000-0000-0000-000000000001",
      deviceToken: "dt_secret",
      requestedProvider: "claude",
    }),
  });

  await expect(client.pair("ABCD-EFGH")).resolves.toEqual({
    deviceId: "40000000-0000-0000-0000-000000000001",
    requestedProvider: "claude",
  });
  expect(store.saved).toEqual({
    deviceId: "40000000-0000-0000-0000-000000000001",
    deviceToken: "dt_secret",
  });
});

it("probes the credential store before spending the code", async () => {
  const store = new MemoryCredentialStore({ writable: false });
  const fetchSpy = vi.fn();
  const client = new PairingClient({
    baseUrl: "http://127.0.0.1:3000",
    credentialStore: store,
    fetch: fetchSpy,
  });

  await expect(client.pair("ABCD-EFGH")).rejects.toThrow(
    /keychain is not writable/i,
  );
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("names the orphaned device when the store fails after redemption", async () => {
  const store = new MemoryCredentialStore({ failOnSave: true });
  const client = new PairingClient({
    baseUrl: "http://127.0.0.1:3000",
    credentialStore: store,
    fetch: fakeFetch({
      deviceId: "40000000-0000-0000-0000-000000000001",
      deviceToken: "dt_secret",
      requestedProvider: "codex",
    }),
  });

  await expect(client.pair("ABCD-EFGH")).rejects.toThrow(
    /40000000-0000-0000-0000-000000000001/,
  );
});
```

The second test is the important one — it asserts the probe happens *before* the network call, which is what stops a failed Keychain write from burning a single-use code.

- [ ] **Step 3: Run the tests and verify they fail**

Run: `pnpm --filter @meld/connector test -- src/pairing`
Expected: FAIL — the modules do not exist.

- [ ] **Step 4: Implement the stores and the client**

`PairingClient.pair` order is fixed and load-bearing: `probe()` → `POST /api/devices/pair` → `save()`. It resolves `{ deviceId, requestedProvider }` and never returns the token, so no caller can log it by accident.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm --filter @meld/connector test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/connector/src/pairing
git commit -m "feat: pair the connector and store credentials in the keychain"
```

---

### Task 8: Gateway client, heartbeat, and the stub run

**Files:**
- Create: `apps/connector/src/transport/gateway-client.ts` and `gateway-client.test.ts`
- Create: `apps/connector/src/transport/backoff.ts` and `backoff.test.ts`
- Create: `apps/connector/src/run/stub-run.ts` and `stub-run.test.ts`
- Move: `scripts/fake-connector-heartbeat.ts` → `apps/connector/src/transport/heartbeat.ts` (with its test)
- Modify: `scripts/fake-connector.ts`, root `package.json`

**Interfaces:**
- Consumes: Task 7's `CredentialStore`, Task 6's paths, Task 6 gateway protocol contracts.
- Produces:
  - `nextBackoffDelay(attempt: number, random?: () => number): number`
  - `createHeartbeatCoordinator(options)` — unchanged, relocated
  - `GatewayClient({ gatewayUrl, credentialStore, createSocket, onFenced })` with `start()`, `stop()`
  - `createStubRun({ taskId, attemptId, send })` with `abort(reason)`

- [ ] **Step 1: Move the heartbeat coordinator**

```bash
git mv scripts/fake-connector-heartbeat.ts apps/connector/src/transport/heartbeat.ts
git mv scripts/fake-connector-heartbeat.test.ts apps/connector/src/transport/heartbeat.test.ts
```

Update the import in `scripts/fake-connector.ts` to `../apps/connector/src/transport/heartbeat`, and the import inside `heartbeat.test.ts` to `./heartbeat`. Change no logic — this is the same extraction reasoning as Task 1.

In the root `package.json`, `test:scripts` currently runs that test file directly. It now runs under the connector package, so replace the script's value with `vitest run scripts/fake-connector.test.ts` if such a file exists, or remove `test:scripts` from the `test` chain if it does not — check before editing.

- [ ] **Step 2: Write the failing backoff and gateway-client tests**

`backoff.test.ts` asserts the delay doubles from 1000ms, never exceeds 30000ms, and that jitter keeps every value inside `[base/2, base]` for a stubbed random source.

`gateway-client.test.ts` drives an injected `createSocket` factory:

```ts
it("reads its credential from the store and presents it as a device header", async () => {
  const store = new MemoryCredentialStore();
  await store.save({ deviceId: DEVICE_ID, deviceToken: "dt_secret" });
  const sockets = recordingSocketFactory();
  const client = new GatewayClient({
    gatewayUrl: "ws://127.0.0.1:8787/ws",
    credentialStore: store,
    createSocket: sockets.create,
  });

  await client.start();

  expect(sockets.last().headers.authorization).toBe(
    `Device ${DEVICE_ID}.dt_secret`,
  );
});

it("stops permanently when the gateway rejects the credential", async () => {
  const sockets = recordingSocketFactory();
  const client = new GatewayClient({ /* ... */ createSocket: sockets.create });

  await client.start();
  sockets.last().emitUnexpectedResponse({ statusCode: 401 });
  await vi.advanceTimersByTimeAsync(60_000);

  expect(sockets.created).toHaveLength(1);
  expect(client.stoppedReason).toBe("re-pair required");
});

it("keeps retrying when the gateway is merely unreachable", async () => {
  /* emit ECONNREFUSED, advance timers, expect a second socket */
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `pnpm --filter @meld/connector test -- src/transport src/run`
Expected: FAIL — the modules do not exist.

- [ ] **Step 4: Implement backoff, the gateway client, and the stub run**

`GatewayClient` takes a `CredentialStore` rather than reaching for the Keychain itself — that injection is what lets Task 11's integration test run on a Linux CI runner with no Keychain.

`401` sets a terminal state and does not reschedule. Every other failure schedules `nextBackoffDelay`.

`stub-run.ts` emits `progress` and `text.delta` events on a timer and exposes `abort(reason)`. Wire `createHeartbeatCoordinator`'s `onLeaseOmitted` to that abort — this is the self-fencing obligation from the gateway design §1.1, and Task 8 of the MVP plan replaces the stub body while keeping the same hook.

- [ ] **Step 5: Run the tests and verify they pass**

```bash
pnpm --filter @meld/connector test
pnpm --filter @meld/connector typecheck
pnpm test:scripts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/connector/src scripts package.json
git commit -m "feat: maintain a fenced gateway connection from the connector"
```

---

### Task 9: CLI and agent entrypoint

**Files:**
- Create: `apps/connector/src/config/connector-config.ts` and `connector-config.test.ts`
- Create: `apps/connector/src/agent.ts` and `agent.test.ts`
- Create: `apps/connector/src/cli.ts` and `cli.test.ts`

**Interfaces:**
- Consumes: Tasks 6, 7, and 8.
- Produces: `readConfig(paths)`, `writeConfig(paths, config)`, `runCli(argv, dependencies)`, and the `agent.ts` entrypoint.

- [ ] **Step 1: Write the failing CLI tests**

Inject every side effect (`CommandRunner`, `CredentialStore`, a filesystem double, a `PairingClient` double) so these run on Linux. Assert:

- `pair --join ABCD-EFGH` fails before redeeming when the built bundle is absent, and the message names the build command;
- a successful `pair` performs its steps in order: probe, redeem, save credential, write config, copy bundle, install LaunchAgent;
- `pair` still reports success — and tells the user `cli start` works in the foreground — when `installLaunchAgent` throws;
- `status` prints the device ID, provider, gateway URL, and loaded state, and its output contains neither the token nor the string `dt_`;
- `uninstall` boots out the agent, deletes the credential, removes the directory, and prints the reminder to revoke the device in the web UI;
- `uninstall` succeeds when nothing is installed.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm --filter @meld/connector test -- src/cli.test.ts`
Expected: FAIL — `src/cli.ts` does not exist.

- [ ] **Step 3: Implement the config, agent, and CLI**

`connector-config.ts` reads and writes `config.json` holding `gatewayUrl`, `deviceId`, and `requestedProvider` — and asserts on write that no key resembling a secret is present, so a future edit cannot quietly add one.

`agent.ts` reads the config, builds a `KeychainStore`, constructs a `GatewayClient`, and starts it. `cli.ts` dispatches the four commands.

- [ ] **Step 4: Run the tests and verify they pass**

```bash
pnpm --filter @meld/connector test
pnpm --filter @meld/connector build
node apps/connector/dist/agent.mjs
```

Expected: tests and build PASS; the bundled agent exits with a configuration error rather than a module-resolution error — proving `@meld/contracts` and `@meld/device-auth` were inlined and no extensionless ESM specifier survived.

- [ ] **Step 5: Commit**

```bash
git add apps/connector/src
git commit -m "feat: add connector CLI and background agent entrypoint"
```

---

### Task 10: Playwright coverage for pairing

**Files:**
- Create: `e2e/device-pairing.spec.ts`
- Modify: `playwright.config.ts`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 5's `MELD_E2E_FAKE_DEVICES` gate and fake.
- Produces: browser coverage of the pairing and revocation screens.

- [ ] **Step 1: Enable the gate for Playwright**

In `playwright.config.ts`, add to `webServer.env`:

```ts
MELD_E2E_FAKE_DEVICES: "true",
```

In `.github/workflows/ci.yml`, the `e2e` job inherits `process.env` through the config, so no workflow change is needed for the gate itself — confirm by reading the job before editing anything.

- [ ] **Step 2: Write the failing E2E spec**

`e2e/device-pairing.spec.ts`, following `e2e/onboarding.spec.ts`'s cookie-based `authenticateContext` helper:

```ts
test("shows a pairing command for the selected provider", async ({ page }) => {
  await page.goto("/00000000-0000-4000-8000-000000000001/settings/devices");
  await page.getByRole("button", { name: "Connect Claude" }).click();

  const command = page.getByTestId("pairing-command");
  await expect(command).toContainText(
    "pnpm --filter @meld/connector cli -- pair --join",
  );
  await expect(page.getByTestId("pairing-code")).toHaveText(/^[0-9A-Z]{8}$/);
});

test("revoking a device removes it from the list", async ({ page }) => {
  await page.goto("/00000000-0000-4000-8000-000000000001/settings/devices");
  await expect(page.getByText("Ada's MacBook")).toBeVisible();

  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke device" }).click();

  await expect(page.getByText("Ada's MacBook")).toBeHidden();
});
```

Both assertions are chosen because they exercise a **server render plus a client action** — the combination that unit tests and `next build` both pass while the browser fails.

- [ ] **Step 3: Run the spec and verify it fails**

Run: `pnpm test:e2e -- device-pairing`
Expected: FAIL — the route is not reachable, or the fake gate is off.

- [ ] **Step 4: Fix whatever the browser surfaces**

Do not adjust the spec to match broken behavior. If the page throws a server-component or `"use client"` error, fix the component — that class of error is exactly why this task exists.

- [ ] **Step 5: Run the full E2E suite and verify it passes**

Run: `pnpm test:e2e`
Expected: PASS, including the pre-existing `onboarding` and `discovery-room` specs.

- [ ] **Step 6: Commit**

```bash
git add e2e/device-pairing.spec.ts playwright.config.ts
git commit -m "test: cover device pairing in the browser"
```

---

### Task 11: End-to-end integration, CI, and documentation

**Files:**
- Create: `apps/connector/src/pairing/pairing-client.integration.test.ts`
- Create: `apps/connector/vitest.integration.config.ts`
- Modify: `apps/connector/package.json`, `.github/workflows/ci.yml`
- Modify: `package.json` (`check:test-colocation`)
- Modify: `docs/product-feature-checklist.md`

**Interfaces:**
- Consumes: every prior task.
- Produces: CI enforcement of the whole pairing path.

- [ ] **Step 1: Write the failing integration test**

`apps/connector/src/pairing/pairing-client.integration.test.ts`, modelled on `apps/gateway/src/server.integration.test.ts`.

The filename is load-bearing: Step 5 of this task enables `check-test-colocation` on `apps/connector`, and that script resolves `foo.integration.test.ts` to a `foo.ts` beside it. A name like `src/pairing.integration.test.ts` has no such source and would fail the very check this task turns on.

Using `postgres` against `SUPABASE_DB_URL` for fixtures and the running web app plus gateway:

1. Create a user and organization fixture.
2. Call `create_device_pairing_code` with a known hash as that user.
3. `POST /api/devices/pair` with the plaintext code; assert `deviceId`, a 43-character `deviceToken`, and the requested provider come back.
4. Construct a `GatewayClient` with a `MemoryCredentialStore` holding that credential and connect to the live gateway; assert `session.accepted` arrives.
5. Create an AI task for that device, drive the stub run, and assert the task reaches `completed`.
6. Revoke the device, send one more heartbeat, and assert the socket closes with `1008`.

Step 6 is what proves Task 3's change is reachable from the outside, not just from a unit double.

- [ ] **Step 2: Add the integration config and script**

Copy `apps/gateway/vitest.integration.config.ts` to `apps/connector/`, and add to `apps/connector/package.json`:

```json
"test:integration": "vitest run --config vitest.integration.config.ts",
```

Confirm `apps/connector/vitest.config.ts` excludes `src/**/*.integration.test.ts`, so `pnpm test` stays database-free.

- [ ] **Step 3: Run it and verify it fails**

```bash
supabase start
pnpm --filter @meld/connector test:integration
```

Expected: FAIL — nothing wires the pieces together yet.

- [ ] **Step 4: Make it pass**

Fix real integration defects only. Do not weaken an assertion to make it green.

- [ ] **Step 5: Extend CI**

In `.github/workflows/ci.yml`, the `gateway-integration` job gains a step after the existing one:

```yaml
      - run: pnpm --filter @meld/connector test:integration
        env:
          GATEWAY_SUPABASE_URL: ${{ env.LOCAL_SUPABASE_URL }}
          GATEWAY_SUPABASE_SERVICE_ROLE_KEY: ${{ env.LOCAL_SUPABASE_SERVICE_ROLE_KEY }}
          SUPABASE_DB_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

Keep the pinned `supabase/setup-cli` version — `2.109.1` is deliberate, because 2.110 has an upstream ownership regression.

In the root `package.json`, extend colocation checking:

```json
"check:test-colocation": "node scripts/check-test-colocation.mjs apps/web apps/gateway apps/connector",
```

- [ ] **Step 6: Update the product checklist**

In `docs/product-feature-checklist.md`, mark pairing, the connector, and device revocation complete. Record explicitly what remains incomplete so the entry cannot be misread as "the connector runs AI work": provider execution is Task 8, room UI is Task 10, and the hosted installer, npm publication, and bundle signing are distribution work.

- [ ] **Step 7: Run the complete local validation**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
supabase db reset
supabase test db
pnpm --filter @meld/gateway test:integration
pnpm --filter @meld/connector test:integration
pnpm test:e2e
```

Expected: every command PASS.

- [ ] **Step 8: Run the manual checklist on a real Mac**

CI has no Keychain and no `launchd`, so these three cannot be automated and must be observed by hand:

1. `pnpm --filter @meld/connector cli -- pair --join <code>` writes a real entry visible in Keychain Access under `com.meld.agent`.
2. Close the Terminal window; `launchctl list | grep com.meld.agent` still shows the agent, and the gateway still reports the device connected.
3. Reboot; the agent reconnects with no user action.

Record the result in the commit message. If any step fails, that is a defect in this task, not an environment quirk.

- [ ] **Step 9: Commit**

```bash
git add apps/connector .github/workflows/ci.yml package.json docs/product-feature-checklist.md
git commit -m "test: verify pairing end to end and enforce it in CI"
```
