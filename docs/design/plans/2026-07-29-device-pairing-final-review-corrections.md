# Device Pairing Final Review Corrections

**Goal:** Close the two ship blockers and one Minor cleanup defect found by the
fresh whole-branch review at `7342c63`, then revalidate the actual final head.

**Authoritative decisions:**

- The installed connector remains a single copied `agent.mjs`; all non-Node
  runtime dependencies must therefore be bundled into it.
- Pairing-code quota exhaustion returns the design's explicit `400` contract
  and the UI preserves the currently visible, still-usable code until a
  replacement succeeds.
- Ambiguous Keychain probe writes receive best-effort cleanup. Probe cleanup
  never exposes random probe secrets or original command output/causes.

---

## Task 1: Portable Agent Artifact and Ambiguous Probe Cleanup

**Files:**
- Modify: `apps/connector/tsup.config.ts`
- Modify: `apps/connector/package.json`
- Create or modify: an adjacent connector bundle smoke test/script
- Modify: `apps/connector/src/pairing/keychain-store.ts`
- Modify: `apps/connector/src/pairing/keychain-store.test.ts`

### Portable bundle acceptance

1. Add a failing relocation smoke test that builds the production connector,
   copies only `dist/agent.mjs` into a temporary directory outside the
   repository, and launches it with a temporary home.
2. Assert the process reaches the expected connector configuration failure
   (`Meld connector is not configured`) and does not fail with
   `ERR_MODULE_NOT_FOUND`.
3. Assert the built artifact has no bare runtime imports for `zod`, `ws`, or
   other non-Node packages.
4. Bundle `zod` and `ws` explicitly in `tsup.config.ts` while preserving the
   Node platform/target and existing internal workspace bundling.
5. Wire the relocation smoke into the connector/repository test surface so a
   normal final gate cannot omit it. Keep the test deterministic and clean up
   its temporary directory.

### Probe cleanup acceptance

1. Extend the stateful Keychain fake to cover a probe write that mutates then
   throws and a nonzero result after mutation.
2. In both cases, `probe()` returns `false` and attempts deletion of the exact
   random probe account.
3. If probe deletion also fails, `probe()` still returns `false`; it must not
   leak the probe secret, stdout/stderr, or original cause.
4. Successful probe behavior remains write → delete → `true`.

### Validation

```bash
pnpm --filter @meld/connector test
pnpm --filter @meld/connector typecheck
pnpm --filter @meld/connector lint
pnpm --filter @meld/connector build
```

Commit: `fix: make installed connector self-contained`

---

## Task 2: Preserve the Usable Pairing Code at Quota

**Files:**
- Modify: `apps/web/src/app/api/devices/pairing-codes/route.ts`
- Modify: `apps/web/src/app/api/devices/pairing-codes/route.test.ts`
- Modify: `apps/web/src/features/ai/components/connect-device.tsx`
- Modify: `apps/web/src/features/ai/components/connect-device.test.tsx`

### API acceptance

1. Add a failing route test where `createPairingCode` rejects with
   `new DeviceServiceError("too_many_pairing_codes")`.
2. Return status `400` and stable copy directing the user to the pairing code
   already on screen.
3. Keep authentication `401`, malformed/schema-invalid `400`, successful
   creation `201`, and unrelated creation failure `409` unchanged.
4. Classify by `DeviceServiceError.code`, never by leaking database details.

### UI acceptance

1. Add a failing component test that first displays a valid code, then requests
   a replacement whose response is the quota `400`.
2. Preserve the existing code, expiry, command, and provider label until a new
   request succeeds.
3. Render the server's stable quota guidance alongside the still-visible code.
4. For unrelated failures, preserve the existing code as the safest recoverable
   state and show the existing generic retry copy.
5. Keep stale-response fencing: an older failed/successful request may not
   overwrite the latest request's provider, code, or error.

### Validation

```bash
pnpm --filter @meld/web exec vitest run src/app/api/devices/pairing-codes/route.test.ts
pnpm --filter @meld/web exec vitest run src/features/ai/components/connect-device.test.tsx
pnpm --filter @meld/web test
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
```

Commit: `fix: preserve pairing code at issuance limit`

---

## Task 3: Final Evidence and Review

1. Amend the residual final-validation report so `7342c63` is explicitly the
   reviewed-but-blocked head, not the final validated head.
2. Run the complete gates at the corrected head:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm dlx supabase@2.109.1 test db
pnpm --filter @meld/gateway test:integration
pnpm --filter @meld/connector test:integration
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=e2e-placeholder-key \
MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY=e2e-placeholder-server-key \
pnpm test:e2e
```

3. Run fresh scoped reviews for Tasks 1 and 2 and a final fix-only whole-branch
   review covering the two Important findings and the Minor finding.
4. Keep the three real-Mac checks pending until a user performs them:
   Keychain visibility, terminal-close persistence, and reboot reconnect.
