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
    /"\$schema"\s*=\s*"https:\/\/conductor\.build\/schemas\/settings\.repo\.schema\.json"/,
  );
  assert.match(settings, /setup\s*=\s*"pnpm install"/);
  assert.match(settings, /run_mode\s*=\s*"nonconcurrent"/);
  assert.match(settings, /\[scripts\.run\.dev\]/);
  assert.match(settings, /command\s*=\s*"\.\/scripts\/conductor-dev\.zsh"/);
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
