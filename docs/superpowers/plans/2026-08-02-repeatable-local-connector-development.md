# Repeatable Local Connector Development Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make local Meld pairing a once-per-Mac operation that survives new Conductor workspaces without malformed commands, self-unloaded LaunchAgents, or competing local runtimes.

**Architecture:** Preserve the existing machine-global connector and credential locations. Runtime activation updates the future LaunchAgent plist without unloading a currently running connector; the browser and CLI tolerate the corrected command shape; shared Conductor scripts run one web/gateway pair at a time and expose non-mutating status plus explicit recovery.

**Tech Stack:** TypeScript 5.9, Node 20+, Vitest 4, React 19, Next.js 16, zsh, pnpm 10, macOS launchctl, Conductor repository settings TOML.

## Global Constraints

- The connector remains the machine-global `com.meld.agent` singleton.
- Pairing remains once per Mac and must never run from workspace setup or recovery.
- Local workspaces share ports 3000 and 8787, one Supabase project, one Keychain credential, and one Application Support tree.
- Conductor must use `scripts.run_mode = "nonconcurrent"`.
- Runtime activation must never leave a previously loaded connector unloaded.
- `NEXT_PUBLIC_MELD_PAIR_COMMAND` remains supported.
- No production pairing protocol or database schema changes.
- Shell scripts must run in Conductor's non-interactive zsh environment and keep web plus gateway in one process group.

---

## File Map

- `apps/connector/src/launchd/launch-agent.ts`: validates and activates the private Node path without self-terminating a loaded connector.
- `apps/connector/src/launchd/launch-agent.test.ts`: pins loaded, unloaded, rollback, and idempotent activation behavior.
- `apps/connector/src/cli.ts`: strips one legacy leading argument separator before normal command dispatch.
- `apps/connector/src/cli.test.ts`: pins canonical and legacy pairing vectors plus malformed-vector rejection.
- `apps/web/src/features/ai/components/use-pairing-code.ts`: owns the corrected default browser pairing command.
- `apps/web/src/features/ai/components/ai-connection-setup.test.tsx`: verifies onboarding renders the corrected command.
- `apps/web/src/features/ai/components/connect-device.test.tsx`: verifies settings/device pairing renders the corrected command in every state.
- `.conductor/settings.toml`: shares dependency setup, nonconcurrent run mode, and named local scripts across workspaces.
- `scripts/conductor-dev.zsh`: loads the copied local environment and starts web plus gateway as one foreground process tree.
- `scripts/conductor-connector-recover.zsh`: bootstraps an existing machine-global plist only when the LaunchAgent is absent.
- `scripts/conductor-workspace.test.mjs`: tests the shared settings text and both shell-script behaviors with isolated fake commands.
- `package.json`: adds the Conductor workspace test to the repository test sequence.

---

### Task 1: Prevent private-runtime activation from unloading its own connector

**Files:**
- Modify: `apps/connector/src/launchd/launch-agent.test.ts`
- Modify: `apps/connector/src/launchd/launch-agent.ts`

**Interfaces:**
- Consumes: `updateLaunchAgentNodePath(paths: ConnectorPaths, nodePath: string, expectedNodeVersion: string, runner: CommandRunner): Promise<void>`.
- Produces: the same public signature with loaded-job deferral and unloaded-job bootstrap semantics; no caller changes.

- [ ] **Step 1: Replace the loaded-cutover expectation with a failing self-preservation test**

Update the first runtime-cutover test so a loaded service is detected before the plist write and never receives `bootout` or `bootstrap`:

```ts
it("updates a loaded agent for its next launch without unloading it", async () => {
  const paths = await temporaryPaths();
  const privateNode = `${paths.runtimeCurrent}/bin/node`;
  await installLaunchAgent(paths, NODE_PATH, cutoverRunner());
  const runner = cutoverRunner({ loaded: true });

  await expect(
    updateLaunchAgentNodePath(paths, privateNode, NODE_VERSION, runner),
  ).resolves.toBeUndefined();

  expect(runner.calls[0]).toEqual({
    executable: privateNode,
    args: ["--version"],
  });
  expect(actions(runner.calls)).toEqual(["--version", "print"]);
  await expect(readFile(paths.plistFile, "utf8")).resolves.toBe(
    renderLaunchAgent(paths, privateNode),
  );
});
```

- [ ] **Step 2: Add the failing unloaded-service bootstrap test**

```ts
it("bootstraps an unloaded agent after writing the verified node", async () => {
  const paths = await temporaryPaths();
  const privateNode = `${paths.runtimeCurrent}/bin/node`;
  await installLaunchAgent(paths, NODE_PATH, cutoverRunner());
  const runner = cutoverRunner({ loaded: false });

  await updateLaunchAgentNodePath(
    paths,
    privateNode,
    NODE_VERSION,
    runner,
  );

  expect(actions(runner.calls)).toEqual([
    "--version",
    "print",
    "bootstrap",
  ]);
  const userDomain = `gui/${process.getuid?.()}`;
  expect(runner.calls.at(-1)?.args).toEqual([
    "bootstrap",
    userDomain,
    paths.plistFile,
  ]);
  await expect(readFile(paths.plistFile, "utf8")).resolves.toBe(
    renderLaunchAgent(paths, privateNode),
  );
});
```

The expected domain comes from the test process, so the assertion works for any developer UID.

- [ ] **Step 3: Update rollback tests to start from an unloaded service**

Pass `loaded: false` to the bootstrap-failure runners. Assert the desired plist is replaced by the previous contents without trying to `bootout` the absent job:

```ts
const runner = cutoverRunner({
  loaded: false,
  bootstrap: { stdout: "", stderr: "bootstrap failed", code: 5 },
});

await expect(
  updateLaunchAgentNodePath(paths, privateNode, NODE_VERSION, runner),
).rejects.toThrow(/bootstrap failed/);

expect(actions(runner.calls)).toEqual([
  "--version",
  "print",
  "bootstrap",
]);
await expect(readFile(paths.plistFile, "utf8")).resolves.toBe(
  renderLaunchAgent(paths, NODE_PATH),
);
```

For the no-previous-plist case, assert the failed desired plist is removed. Delete the existing `"reports both failures when the rollback cannot restart the previous agent"` test: the new unloaded-job rollback restores disk state without starting a second job, so there is no second launchctl failure to aggregate.

- [ ] **Step 4: Run the focused tests and verify they fail against the current restart behavior**

Run:

```bash
pnpm --filter @meld/connector exec vitest run src/launchd/launch-agent.test.ts
```

Expected: FAIL because a loaded service receives `bootout`/`bootstrap`, and the unloaded path currently calls `bootout` before `bootstrap`.

- [ ] **Step 5: Implement loaded-job deferral and direct unloaded-job bootstrap**

Replace the unconditional `restartAgent` cutover inside `updateLaunchAgentNodePath` with this state flow:

```ts
const desired = renderLaunchAgent(paths, nodePath);
const previous = await readPlist(paths.plistFile);
const loaded = await isLaunchAgentLoaded(paths, runner);

if (previous === desired && loaded) {
  return;
}

await Promise.all([
  mkdir(path.dirname(paths.plistFile), { recursive: true }),
  mkdir(path.dirname(paths.logFile), { recursive: true }),
]);
await writePlistAtomically(paths.plistFile, desired);

if (loaded) {
  // The current agent may be executing this function. Its in-memory launchd
  // job continues under the supported bootstrap Node; launchd reads the new
  // private-runtime plist on the next ordinary load.
  return;
}

const result = await runner.run("launchctl", [
  "bootstrap",
  currentUserDomain(),
  paths.plistFile,
]);
if (result.code === 0) {
  return;
}

const failure = launchctlFailure("bootstrap", result);
if (previous === undefined) {
  await rm(paths.plistFile, { force: true });
  throw failure;
}

await writePlistAtomically(paths.plistFile, previous);
throw failure;
```

Delete `restartAgent` if no remaining caller uses it. Keep candidate-version validation before any plist or launchctl state mutation.

- [ ] **Step 6: Run LaunchAgent and runtime/provider setup tests**

Run:

```bash
pnpm --filter @meld/connector exec vitest run \
  src/launchd/launch-agent.test.ts \
  src/providers/runtime-installer.test.ts \
  src/providers/provider-setup.test.ts
```

Expected: PASS. Confirm no test for a loaded activation expects `bootout`.

- [ ] **Step 7: Commit the safe runtime activation**

```bash
git add apps/connector/src/launchd/launch-agent.ts \
  apps/connector/src/launchd/launch-agent.test.ts
git commit -m "fix: keep connector loaded during runtime activation"
```

---

### Task 2: Correct pairing commands and tolerate stale browser builds

**Files:**
- Modify: `apps/connector/src/cli.test.ts`
- Modify: `apps/connector/src/cli.ts`
- Modify: `apps/web/src/features/ai/components/use-pairing-code.ts`
- Create: `apps/web/src/features/ai/components/use-pairing-code.test.ts`
- Modify: `apps/web/src/features/ai/components/ai-connection-setup.test.tsx`
- Modify: `apps/web/src/features/ai/components/connect-device.test.tsx`

**Interfaces:**
- Consumes: `runCli(argv: string[], dependencies?: CliDependencies): Promise<void>` and exported `PAIRING_COMMAND: string`.
- Produces: `runCli` accepting either `pair --join CODE` or one legacy leading `--`; `PAIRING_COMMAND` defaults to `pnpm --filter @meld/connector cli pair --join`.

- [ ] **Step 1: Add failing CLI compatibility tests**

Add these cases near the existing successful pairing tests:

```ts
it("accepts one legacy argument separator before pair", async () => {
  const context = harness();

  await runCli(
    ["--", "pair", "--join", "ABCD-EFGH"],
    context.dependencies,
  );

  expect(context.pair).toHaveBeenCalledWith("ABCD-EFGH");
});

it("does not hide malformed arguments behind legacy normalization", async () => {
  const context = harness();

  await expect(
    runCli(
      ["--", "--", "pair", "--join", "ABCD-EFGH"],
      context.dependencies,
    ),
  ).rejects.toThrow(/usage/i);
  expect(context.pair).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Change web expectations to the canonical command**

In onboarding and device-management tests, replace only current rendered-command expectations:

```ts
expect(screen.getByTestId("pairing-command")).toHaveTextContent(
  "pnpm --filter @meld/connector cli pair --join MELD2026",
);
```

and:

```ts
expect(screen.getByTestId("pairing-command")).toHaveTextContent(
  `pnpm --filter @meld/connector cli pair --join ${code}`,
);
```

Do not rewrite historical design documents that describe the old plan.

Create `use-pairing-code.test.ts` to preserve the environment override while pinning the new fallback:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("PAIRING_COMMAND", () => {
  it("uses the canonical local command by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_MELD_PAIR_COMMAND", "");
    delete process.env.NEXT_PUBLIC_MELD_PAIR_COMMAND;

    const { PAIRING_COMMAND } = await import("./use-pairing-code");

    expect(PAIRING_COMMAND).toBe(
      "pnpm --filter @meld/connector cli pair --join",
    );
  });

  it("preserves an explicit public pairing-command override", async () => {
    vi.stubEnv("NEXT_PUBLIC_MELD_PAIR_COMMAND", "meld-dev pair --join");

    const { PAIRING_COMMAND } = await import("./use-pairing-code");

    expect(PAIRING_COMMAND).toBe("meld-dev pair --join");
  });
});
```

- [ ] **Step 3: Run focused connector and web tests to verify failure**

Run:

```bash
pnpm --filter @meld/connector exec vitest run src/cli.test.ts
pnpm --filter web exec vitest run \
  src/features/ai/components/use-pairing-code.test.ts \
  src/features/ai/components/ai-connection-setup.test.tsx \
  src/features/ai/components/connect-device.test.tsx
```

Expected: the legacy CLI vector fails with the usage message, and web tests still render `cli -- pair`.

- [ ] **Step 4: Normalize exactly one leading separator in the connector CLI**

At the start of `runCli`, normalize without mutating the caller's array:

```ts
export async function runCli(
  argv: string[],
  dependencies: CliDependencies = runtimeDependencies(),
): Promise<void> {
  const args = argv[0] === "--" ? argv.slice(1) : argv;

  switch (args[0]) {
    case "pair":
      await pair(args, dependencies);
      return;

    case "start":
      if (args.length !== 1) {
        throw new Error("Usage: cli start");
      }
      dependencies.output("Starting the Meld connector in the foreground.");
      await dependencies.startForeground();
      return;

    case "status":
      if (args.length !== 1) {
        throw new Error("Usage: cli status");
      }
      await status(dependencies);
      return;

    case "uninstall":
      if (args.length !== 1) {
        throw new Error("Usage: cli uninstall");
      }
      await uninstall(dependencies);
      return;

    default:
      throw new Error(
        "Usage: cli <pair --join CODE | start | status | uninstall>",
      );
  }
}
```

Use `args` for every length check and dispatch in the function. Passing two separators leaves one separator and reaches the default usage error.

- [ ] **Step 5: Correct the web default command**

Change only the fallback value in `use-pairing-code.ts`:

```ts
export const PAIRING_COMMAND =
  process.env.NEXT_PUBLIC_MELD_PAIR_COMMAND ??
  "pnpm --filter @meld/connector cli pair --join";
```

Keep the environment override and pairing-code concatenation unchanged.

- [ ] **Step 6: Run all focused tests and a real argument-routing smoke check**

Run:

```bash
pnpm --filter @meld/connector exec vitest run src/cli.test.ts
pnpm --filter web exec vitest run \
  src/features/ai/components/use-pairing-code.test.ts \
  src/features/ai/components/ai-connection-setup.test.tsx \
  src/features/ai/components/connect-device.test.tsx
pnpm --filter @meld/connector cli -- status
```

Expected: tests PASS. The final command reaches `status` instead of printing the top-level usage message; it may report installed connector state from the Mac.

- [ ] **Step 7: Commit pairing-command compatibility**

```bash
git add apps/connector/src/cli.ts apps/connector/src/cli.test.ts \
  apps/web/src/features/ai/components/use-pairing-code.ts \
  apps/web/src/features/ai/components/use-pairing-code.test.ts \
  apps/web/src/features/ai/components/ai-connection-setup.test.tsx \
  apps/web/src/features/ai/components/connect-device.test.tsx
git commit -m "fix: render and accept valid pairing commands"
```

---

### Task 3: Add branch-safe Conductor setup, run, status, and recovery scripts

**Files:**
- Create: `.conductor/settings.toml`
- Create: `scripts/conductor-dev.zsh`
- Create: `scripts/conductor-connector-recover.zsh`
- Create: `scripts/conductor-workspace.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: copied `apps/web/.env.local`, pnpm workspace package names `web` and `@meld/gateway`, and machine-global LaunchAgent label `com.meld.agent`.
- Produces: Conductor run IDs `dev`, `connector-status`, and `connector-recover`; root script `test:conductor`.

- [ ] **Step 1: Write the failing workspace-configuration test**

Create `scripts/conductor-workspace.test.mjs` with structural assertions for the settings and zsh scripts:

```js
import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const macTest = process.platform === "darwin" ? test : test.skip;
const settingsPath = path.join(root, ".conductor", "settings.toml");
const devScript = path.join(root, "scripts", "conductor-dev.zsh");
const recoverScript = path.join(
  root,
  "scripts",
  "conductor-connector-recover.zsh",
);

test("Conductor settings use one nonconcurrent local runtime", async () => {
  const settings = await readFile(settingsPath, "utf8");

  assert.match(
    settings,
    /\"\$schema\"\s*=\s*\"https:\/\/conductor\.build\/schemas\/settings\.repo\.schema\.json\"/,
  );
  assert.match(settings, /setup\s*=\s*\"pnpm install\"/);
  assert.match(settings, /run_mode\s*=\s*\"nonconcurrent\"/);
  assert.match(settings, /\[scripts\.run\.dev\]/);
  assert.match(settings, /command\s*=\s*\"\.\/scripts\/conductor-dev\.zsh\"/);
  assert.match(settings, /\[scripts\.run\.connector-status\]/);
  assert.match(settings, /\[scripts\.run\.connector-recover\]/);
  assert.doesNotMatch(settings, /pair\s+--join/);
});

macTest("Conductor zsh scripts have valid syntax", async () => {
  for (const script of [devScript, recoverScript]) {
    const result = spawnSync("/bin/zsh", ["-n", script], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    await access(script);
  }
});

macTest("development script loads env and starts web plus gateway together", async () => {
  const fixture = await devFixture();
  try {
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      await readFile(fixture.argsFile, "utf8"),
      "--parallel --filter web --filter @meld/gateway dev\n",
    );
    assert.equal(await readFile(fixture.envFile, "utf8"), "loaded\n");
  } finally {
    await fixture.cleanup();
  }
});

macTest("connector recovery refuses to pair when no plist exists", async () => {
  const fixture = await recoveryFixture({ loaded: false, plist: false });
  try {
    const result = fixture.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /pair this Mac/i);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /--join/);
  } finally {
    await fixture.cleanup();
  }
});
```

- [ ] **Step 2: Add fake-launchctl recovery behavior tests**

Extend the same test file with this development-script fixture:

```js
async function devFixture() {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "meld-conductor-dev-"),
  );
  const bin = path.join(workspace, "bin");
  const argsFile = path.join(workspace, "pnpm.args");
  const capturedEnvFile = path.join(workspace, "pnpm.env");
  await mkdir(path.join(workspace, "apps", "web"), { recursive: true });
  await mkdir(bin, { recursive: true });
  await writeFile(
    path.join(workspace, "apps", "web", ".env.local"),
    "MELD_TEST_SENTINEL=loaded\n",
  );
  await writeFile(
    path.join(bin, "pnpm"),
    `#!/bin/zsh
print -r -- "$*" > "$MELD_PNPM_ARGS_FILE"
print -r -- "$MELD_TEST_SENTINEL" > "$MELD_PNPM_ENV_FILE"
`,
    { mode: 0o755 },
  );

  return {
    argsFile,
    envFile: capturedEnvFile,
    run: () =>
      spawnSync("/bin/zsh", [devScript], {
        cwd: workspace,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:/usr/bin:/bin`,
          MELD_PNPM_ARGS_FILE: argsFile,
          MELD_PNPM_ENV_FILE: capturedEnvFile,
        },
      }),
    cleanup: () => rm(workspace, { recursive: true, force: true }),
  };
}
```

Then add this recovery helper, which puts fake `launchctl` and `id` commands first on `PATH`, creates an optional temporary plist, and records invocations without touching the developer's real LaunchAgent:

```js
async function recoveryFixture({ loaded, plist = true }) {
  const home = await mkdtemp(
    path.join(os.tmpdir(), "meld-conductor-recovery-"),
  );
  const bin = path.join(home, "bin");
  const callsFile = path.join(home, "launchctl.calls");
  const bootstrappedFile = path.join(home, "bootstrapped");
  const plistFile = path.join(
    home,
    "Library",
    "LaunchAgents",
    "com.meld.agent.plist",
  );
  await mkdir(bin, { recursive: true });
  await writeFile(callsFile, "");
  if (plist) {
    await mkdir(path.dirname(plistFile), { recursive: true });
    await writeFile(plistFile, "test plist");
  }

  const launchctl = path.join(bin, "launchctl");
  await writeFile(
    launchctl,
    `#!/bin/zsh
print -r -- "$*" >> "$MELD_CALLS_FILE"
if [[ "$1" == "print" && ( "$MELD_LOADED" == "1" || -f "$MELD_BOOTSTRAPPED_FILE" ) ]]; then
  exit 0
fi
if [[ "$1" == "bootstrap" ]]; then
  touch "$MELD_BOOTSTRAPPED_FILE"
  exit 0
fi
exit 3
`,
    { mode: 0o755 },
  );
  await writeFile(
    path.join(bin, "id"),
    "#!/bin/zsh\n[[ \"$1\" == \"-u\" ]] && print 501\n",
    { mode: 0o755 },
  );

  return {
    run: () =>
      spawnSync("/bin/zsh", [recoverScript], {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: home,
          PATH: `${bin}:/usr/bin:/bin`,
          MELD_CALLS_FILE: callsFile,
          MELD_BOOTSTRAPPED_FILE: bootstrappedFile,
          MELD_LOADED: loaded ? "1" : "0",
        },
      }),
    calls: async () =>
      (await readFile(callsFile, "utf8")).trim().split("\n").filter(Boolean),
    cleanup: () => rm(home, { recursive: true, force: true }),
  };
}
```

Pin these behaviors:

```js
macTest("connector recovery leaves an already loaded service alone", async () => {
  const fixture = await recoveryFixture({ loaded: true, plist: true });
  try {
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /already loaded/i);
    assert.deepEqual(await fixture.calls(), ["print gui/501/com.meld.agent"]);
  } finally {
    await fixture.cleanup();
  }
});

macTest("connector recovery bootstraps an existing unloaded plist", async () => {
  const fixture = await recoveryFixture({ loaded: false, plist: true });
  try {
    const result = fixture.run();
    assert.equal(result.status, 0, result.stderr);
    const calls = await fixture.calls();
    assert.equal(calls[0], "print gui/501/com.meld.agent");
    assert.match(calls[1], /^bootstrap gui\/501 .*com\.meld\.agent\.plist$/);
    assert.equal(calls[2], "print gui/501/com.meld.agent");
  } finally {
    await fixture.cleanup();
  }
});
```

The fixture's second `print` succeeds only after the fake `bootstrap` creates its marker file, which proves the recovery script verifies the newly loaded service.
The settings-structure test remains active on every CI host. Tests that execute zsh or model LaunchAgent behavior use `macTest`, so the Linux CI suite records them as skipped rather than failing because `/bin/zsh` is absent.

- [ ] **Step 3: Run the workspace test to verify missing-file failure**

Run:

```bash
node --test scripts/conductor-workspace.test.mjs
```

Expected: FAIL with `ENOENT` for `.conductor/settings.toml` or one of the two zsh scripts.

- [ ] **Step 4: Create the foreground development script**

Create executable `scripts/conductor-dev.zsh`:

```zsh
#!/bin/zsh
set -euo pipefail

readonly env_file="apps/web/.env.local"

if [[ ! -f "$env_file" ]]; then
  print -u2 "Missing $env_file. Copy the local Meld environment before running the workspace."
  exit 1
fi

set -a
source "$env_file"
set +a

exec pnpm --parallel --filter web --filter @meld/gateway dev
```

This uses `exec` so Conductor owns one process group and can stop both persistent processes together.

- [ ] **Step 5: Create the non-pairing recovery script**

Create executable `scripts/conductor-connector-recover.zsh`:

```zsh
#!/bin/zsh
set -euo pipefail

readonly label="com.meld.agent"
readonly user_domain="gui/$(id -u)"
readonly service_target="$user_domain/$label"
readonly plist="$HOME/Library/LaunchAgents/$label.plist"

if launchctl print "$service_target" >/dev/null 2>&1; then
  print "Meld connector LaunchAgent is already loaded."
  exit 0
fi

if [[ ! -f "$plist" ]]; then
  print -u2 "Meld connector is not installed. Pair this Mac once from the Meld browser setup."
  exit 1
fi

launchctl bootstrap "$user_domain" "$plist"
launchctl print "$service_target" >/dev/null
print "Meld connector LaunchAgent loaded."
```

Do not add `pair`, bundle-copy, credential, or `bootout` operations.

- [ ] **Step 6: Create shared Conductor settings**

Create `.conductor/settings.toml`:

```toml
"$schema" = "https://conductor.build/schemas/settings.repo.schema.json"

[scripts]
setup = "pnpm install"
run_mode = "nonconcurrent"

[scripts.run.dev]
available_in = [ "local" ]
command = "./scripts/conductor-dev.zsh"
default = true
icon = "play"

[scripts.run.connector-status]
available_in = [ "local" ]
command = "pnpm --filter @meld/connector cli status"
icon = "activity"

[scripts.run.connector-recover]
available_in = [ "local" ]
command = "./scripts/conductor-connector-recover.zsh"
icon = "refresh-cw"
```

The settings follow Conductor's repository settings schema and intentionally use `nonconcurrent` because the project has fixed ports, one local database, and one global connector.

- [ ] **Step 7: Make both shell scripts executable and wire the test into pnpm**

Run:

```bash
chmod 755 scripts/conductor-dev.zsh scripts/conductor-connector-recover.zsh
```

Add the exact root script and call it from `test` before workspace tests:

```json
{
  "scripts": {
    "test": "pnpm test:astryx && pnpm test:colocation && pnpm check:provider-adapters && pnpm test:sql && pnpm test:conductor && pnpm test:workspace",
    "test:conductor": "node --test scripts/conductor-workspace.test.mjs"
  }
}
```

- [ ] **Step 8: Run automated configuration tests**

Run:

```bash
pnpm test:conductor
```

Expected: PASS for settings structure, zsh syntax, absent-install refusal, loaded no-op, and unloaded bootstrap.

- [ ] **Step 9: Run a non-mutating local script smoke check**

Run:

```bash
pnpm --filter @meld/connector cli status
./scripts/conductor-connector-recover.zsh
launchctl print "gui/$(id -u)/com.meld.agent" | grep -E 'state =|pid ='
```

Expected: status reports the existing device without exposing its token; recovery says the service is already loaded; launchctl reports a live or loaded `com.meld.agent`. Do not run this live smoke on CI or a non-macOS host.

- [ ] **Step 10: Commit Conductor workspace automation**

```bash
git add .conductor/settings.toml scripts/conductor-dev.zsh \
  scripts/conductor-connector-recover.zsh \
  scripts/conductor-workspace.test.mjs package.json
git commit -m "chore: add repeatable Conductor workspace scripts"
```

---

### Task 4: Run integrated regression and live LaunchAgent verification

**Files:**
- Verify only; modify a task-owned file only if its check reveals a defect.

**Interfaces:**
- Consumes: all outputs from Tasks 1-3.
- Produces: evidence that source, UI, and local machine behavior agree with the approved design.

- [ ] **Step 1: Run connector verification**

```bash
pnpm --filter @meld/connector test
pnpm --filter @meld/connector typecheck
pnpm --filter @meld/connector lint
```

Expected: PASS, including the bundled-agent smoke test.

- [ ] **Step 2: Run web feature and design-system verification**

```bash
pnpm --filter web exec vitest run \
  src/features/ai/components/use-pairing-code.test.ts \
  src/features/ai/components/ai-connection-setup.test.tsx \
  src/features/ai/components/connect-device.test.tsx
pnpm --filter web typecheck
pnpm check:astryx
```

Expected: PASS with no `cli -- pair` assertion remaining in current source tests.

- [ ] **Step 3: Run repository configuration verification**

```bash
pnpm test:conductor
git diff --check
```

Expected: PASS and no whitespace errors.

- [ ] **Step 4: Perform the loaded-agent runtime-activation smoke test without rotating credentials**

Build the connector, record the current LaunchAgent service state, invoke idempotent private-runtime activation against the installed runtime, and re-check the same service:

```bash
pnpm --filter @meld/connector build
launchctl print "gui/$(id -u)/com.meld.agent" | grep -E 'state =|pid ='
pnpm --filter @meld/connector exec tsx -e '
  import { homedir } from "node:os";
  import { connectorPaths } from "./src/config/paths.ts";
  import { nodeCommandRunner } from "./src/launchd/command-runner.ts";
  import { updateLaunchAgentNodePath } from "./src/launchd/launch-agent.ts";
  import { RELEASES } from "./src/providers/release-manifest.ts";
  const paths = connectorPaths(homedir());
  await updateLaunchAgentNodePath(
    paths,
    paths.runtimeNode,
    RELEASES.node.version,
    nodeCommandRunner,
  );
'
launchctl print "gui/$(id -u)/com.meld.agent" | grep -E 'state =|pid ='
```

Expected: both launchctl inspections find the same loaded `com.meld.agent`; no pairing code is minted or redeemed. The differing-plist loaded path remains covered by the unit test because changing the live plist away from its verified runtime solely for a smoke test would be unsafe.

- [ ] **Step 5: Confirm final repository state**

```bash
git status --short
git log --oneline -5
```

Expected: only intentional implementation commits follow the already committed design and plan documents; no secrets, generated connector bundles, local `.env` files, or Application Support files are tracked.
