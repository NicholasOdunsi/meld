# Task 1 Report: Portable Agent and Probe Cleanup

## Status

DONE

## Implementation

- Explicitly bundled `zod` and `ws` alongside the existing Meld workspace
  packages in the Node 20 ESM production artifact.
- Added a `createRequire(import.meta.url)` banner so bundled `ws` CommonJS
  modules can load Node built-ins when the artifact runs as ESM.
- Added `scripts/agent-bundle-smoke.mjs` and wired it into the connector's
  normal `test` script through `test:bundle`.
- The smoke builds production output, copies only `dist/agent.mjs` to a
  temporary directory, supplies a temporary `HOME`, launches it with the
  current Node executable, and removes the entire temporary directory.
- The smoke rejects bare non-Node static or dynamic imports, explicitly rejects
  bare `zod`/`ws` imports, rejects `ERR_MODULE_NOT_FOUND`, and requires the
  sanitized missing-configuration diagnostic and a nonzero exit.
- Changed `KeychainStore.probe()` to attempt exact-account cleanup after every
  write outcome, including a thrown runner error and a fulfilled nonzero
  result. Probe success now requires both a verified successful write and a
  verified successful cleanup.
- Extended the stateful generic-password fake with a
  `nonzero-after-mutation` fault mode.

## Relocation evidence

### RED 1: external dependency

After the original build, copying only `agent.mjs` to `/tmp` and launching it
failed before configuration loading:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'zod' imported from
/private/tmp/meld-connector-red.../agent.mjs
```

The process exited 1 and never emitted the expected connector configuration
diagnostic.

### RED 2: bundled CommonJS interop

After first adding `zod` and `ws` to `noExternal`, the relocation smoke exposed
the next production boundary:

```text
Error: Dynamic require of "events" is not supported
```

This came from bundled `ws` CommonJS code in the ESM output. The Node
`createRequire` banner resolved the built-in dependency without restoring a
repository-local package lookup.

### GREEN

`pnpm --filter @meld/connector test:bundle` now:

1. builds `dist/agent.mjs`;
2. copies only that file outside the repository;
3. finds no bare non-Node import specifiers;
4. launches it with an empty temporary home;
5. observes a nonzero exit containing `Meld connector is not configured`;
6. observes no `ERR_MODULE_NOT_FOUND`.

The command exits successfully and cleans its temporary directory.

## Probe state transitions

Let `P` be the generated `__probe__:<uuid>` account and `S` its random secret.
Each test starts with an empty stateful Keychain map.

### Successful probe

1. Add succeeds: `{ P→S }`.
2. Exact-account delete succeeds: `{}`.
3. Return `true`.

### Write mutates, then throws

1. Add mutates: `{ P→S }`.
2. Runner throws a sentinel cause.
3. Exact-account delete succeeds: `{}`.
4. Return `false`.

### Write returns nonzero after mutation

1. Add mutates: `{ P→S }`.
2. Runner returns code 36 with sentinel output.
3. Exact-account delete succeeds: `{}`.
4. Return `false`.

### Ambiguous write and cleanup failure

1. Add mutates, then throws: `{ P→S }`.
2. Exact-account delete is attempted but returns nonzero without mutation.
3. State remains `{ P→S }`.
4. Return the boolean `false`; no probe account, secret, command output, or
   original cause is exposed.

## TDD evidence

Focused Keychain RED:

```text
pnpm --filter @meld/connector exec vitest run src/pairing/keychain-store.test.ts
Test Files  1 failed (1)
Tests       3 failed | 30 passed (33)
```

The three failures proved both ambiguous write modes skipped deletion and that
the cleanup-failure path made no deletion attempt.

Focused Keychain GREEN:

```text
pnpm --filter @meld/connector exec vitest run src/pairing/keychain-store.test.ts
Test Files  1 passed (1)
Tests       33 passed (33)
```

## Validation

```text
pnpm --filter @meld/connector test
Test Files  13 passed (13)
Tests       96 passed (96)
test:bundle passed

pnpm --filter @meld/connector typecheck
tsc --noEmit

pnpm --filter @meld/connector lint
eslint

pnpm --filter @meld/connector build
tsup build success

git diff --check
passed
```

## Files changed

- `apps/connector/package.json`
- `apps/connector/scripts/agent-bundle-smoke.mjs`
- `apps/connector/tsup.config.ts`
- `apps/connector/src/pairing/keychain-store.ts`
- `apps/connector/src/pairing/keychain-store.test.ts`

## Self-review

- Confirmed the installation-boundary test copies only `agent.mjs`; it does not
  copy `node_modules`, a package manifest, source maps, config, or repository
  files.
- Confirmed the relocated process reaches application configuration loading
  and fails only because the temporary home has no Meld config.
- Confirmed the artifact retains Node 20, ESM, no splitting, and existing Meld
  package bundling.
- Confirmed probe cleanup targets the same generated account used by the write.
- Confirmed no real Keychain command is used by the new unit tests.
- Confirmed every ambiguous write returns `false`, even when cleanup also
  fails, without propagating runner output or causes.
- Confirmed generated `dist/` output is not included in the commit.

## Concerns

None.
