#!/usr/bin/env node
// Managed-provider live smoke harness.
//
// One code path proves the whole managed-provider inference contract in three
// modes:
//
//   node live-smoke.mjs --self-test      # fake binaries, runs in CI
//   node live-smoke.mjs --live codex     # real subscription-authenticated codex
//   node live-smoke.mjs --live claude    # real subscription-authenticated claude
//
// The live modes are deliberately hard to trigger by accident: they refuse to
// run unless MELD_LIVE_PROVIDER_ACCEPTANCE=1 is set *and* an isolated managed
// HOME and binary are pointed at explicitly. They validate the managed paths and
// authentication, run exactly one harmless schema-bound content-only prompt, and
// print only stage and result status -- never the prompt, the room, a
// credential, or the provider's own output.
//
// --self-test wires temporary fake binaries into the same pipeline so the harness
// itself is covered on every CI run without ever touching a real provider.

import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Exit codes shared with smoke-test.sh so a caller reads one vocabulary.
const EXIT_USAGE = 64;
const EXIT_BLOCKED = 67;
const EXIT_PREFLIGHT = 68;
const EXIT_FAILURE = 1;

const MAX_OUTPUT_BYTES = 1024 * 1024;
const PROVIDER_TIMEOUT_MS = 120_000;

// Pinned from apps/connector/src/providers/release-manifest.ts. The connector's
// own tests are the authority on these values; the harness only has to agree.
const PINNED = {
  codex: {
    version: "0.146.0",
    banner: "codex-cli 0.146.0",
    model: "gpt-5.5",
    statusArgs: ["login", "status"],
    configVariable: "CODEX_HOME",
  },
  claude: {
    version: "2.1.220",
    banner: "2.1.220 (Claude Code)",
    model: "claude-opus-4-8",
    statusArgs: ["auth", "status"],
    configVariable: "CLAUDE_CONFIG_DIR",
  },
};

// The one harmless prompt every mode sends. It asks for a single content-only
// field and nothing else; the schema is what the provider is bound to.
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer"],
  properties: { answer: { type: "string" } },
};

class SmokeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Prints a stage line to stdout. Only ever the stage name and its result. */
function stage(name, result) {
  process.stdout.write(`stage: ${name} ${result}\n`);
}

function usage() {
  process.stderr.write(
    "usage: live-smoke.mjs --self-test | --live codex|claude\n",
  );
}

async function isExecutableFile(candidate) {
  try {
    const stats = await stat(candidate);
    return stats.isFile() && (stats.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/**
 * The managed environment a provider child runs under: PATH with the managed bin
 * first, an isolated HOME, the provider's own config-directory variable pointed
 * at that same HOME, and a TMPDIR inside it. Built from `{}`.
 */
function managedEnvironment(provider, home, binDir) {
  return {
    PATH: `${binDir}:/usr/bin:/bin`,
    HOME: home,
    [PINNED[provider].configVariable]: home,
    TMPDIR: home,
    LANG: "C.UTF-8",
    LC_ALL: "C.UTF-8",
  };
}

function spawnManaged({ binary, args, provider, home, binDir }) {
  return new Promise((resolve) => {
    const child = spawn(binary, args, {
      shell: false,
      detached: true,
      cwd: home,
      env: managedEnvironment(provider, home, binDir),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let truncated = false;
    const timer = setTimeout(() => {
      try {
        if (child.pid !== undefined) {
          process.kill(-child.pid, "SIGKILL");
        }
      } catch {
        // Already gone.
      }
    }, PROVIDER_TIMEOUT_MS);
    timer.unref();
    child.stdout.on("data", (chunk) => {
      if (Buffer.byteLength(stdout, "utf8") < MAX_OUTPUT_BYTES) {
        stdout += chunk.toString("utf8");
      } else {
        truncated = true;
      }
    });
    child.stderr.on("data", (chunk) => {
      if (Buffer.byteLength(stderr, "utf8") < MAX_OUTPUT_BYTES) {
        stderr += chunk.toString("utf8");
      } else {
        truncated = true;
      }
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr, truncated });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, truncated });
    });
    child.stdin.end();
  });
}

/** Reads a provider's JSONL stdout into an array of objects, or throws. */
function parseJsonl(stdout, truncated) {
  if (truncated || Buffer.byteLength(stdout, "utf8") > MAX_OUTPUT_BYTES) {
    throw new SmokeError(EXIT_FAILURE, "provider output exceeded the cap");
  }
  const events = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    let value;
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new SmokeError(EXIT_FAILURE, "provider emitted a non-JSON line");
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      events.push({});
      continue;
    }
    events.push(value);
  }
  return events;
}

/** Extracts the schema-bound structured payload from a provider's output. */
function extractStructured(provider, stdout, truncated) {
  const events = parseJsonl(stdout, truncated);
  if (provider === "codex") {
    for (const event of events) {
      if (
        event.type === "item.completed" &&
        event.item &&
        event.item.type === "agent_message" &&
        typeof event.item.text === "string"
      ) {
        try {
          return JSON.parse(event.item.text);
        } catch {
          throw new SmokeError(
            EXIT_FAILURE,
            "codex agent message was not JSON",
          );
        }
      }
    }
    throw new SmokeError(EXIT_FAILURE, "codex produced no structured answer");
  }
  for (const event of events) {
    if (event.type === "result") {
      if (event.subtype !== "success" || event.is_error === true) {
        throw new SmokeError(EXIT_FAILURE, "claude reported an error result");
      }
      if (event.structured_output === undefined) {
        throw new SmokeError(EXIT_FAILURE, "claude returned no structured answer");
      }
      return event.structured_output;
    }
  }
  throw new SmokeError(EXIT_FAILURE, "claude produced no result event");
}

function validateAnswer(payload) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    typeof payload.answer !== "string" ||
    payload.answer.trim().length === 0
  ) {
    throw new SmokeError(EXIT_FAILURE, "structured output did not match the schema");
  }
}

/** Classifies a status probe's verdict without echoing its text. */
function classifyAuthentication(provider, code, stdout) {
  if (provider === "codex") {
    if (/logged in using (an )?(api key|bedrock|vertex|foundry|aws|gcp|azure)/i.test(stdout)) {
      throw new SmokeError(EXIT_FAILURE, "codex reported non-subscription auth");
    }
    if (code === 0 && /Logged in using ChatGPT/.test(stdout)) {
      return;
    }
    throw new SmokeError(
      EXIT_BLOCKED,
      "live_blocked: isolated Codex HOME is not authenticated with ChatGPT",
    );
  }
  if (code !== 0) {
    throw new SmokeError(EXIT_FAILURE, "claude auth status command failed");
  }
  let verdict;
  try {
    verdict = JSON.parse(stdout);
  } catch {
    throw new SmokeError(EXIT_FAILURE, "claude auth status returned malformed JSON");
  }
  if (verdict.loggedIn !== true) {
    throw new SmokeError(
      EXIT_BLOCKED,
      "live_blocked: isolated Claude HOME lacks a subscription session",
    );
  }
  const method = String(verdict.authMethod ?? "").toLowerCase();
  if (/api.?key|bedrock|vertex|foundry|aws|gcp|azure/.test(method)) {
    throw new SmokeError(EXIT_FAILURE, "claude reported non-subscription auth");
  }
}

function inferenceArgs(provider, home) {
  const schemaFile = path.join(home, "response-schema.json");
  const prompt =
    "Return a JSON object with a single field named answer whose value is the word acknowledged.";
  if (provider === "codex") {
    return [
      "exec",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--json",
      "--model",
      PINNED.codex.model,
      "--output-schema",
      schemaFile,
      prompt,
    ];
  }
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    schemaFile,
    "--model",
    PINNED.claude.model,
    prompt,
  ];
}

/**
 * The staged pipeline every mode shares. It prints one line per stage and never
 * the prompt or the provider's output.
 */
async function runProvider({ provider, home, binary }) {
  const pinned = PINNED[provider];
  const binDir = path.dirname(binary);

  if (!path.isAbsolute(binary) || !(await isExecutableFile(binary))) {
    throw new SmokeError(
      EXIT_BLOCKED,
      `live_blocked: managed ${provider} binary is not an absolute executable path`,
    );
  }
  stage("validate_paths", "ok");

  await writeFile(
    path.join(home, "response-schema.json"),
    `${JSON.stringify(RESPONSE_SCHEMA)}\n`,
    "utf8",
  );

  const versionRun = await spawnManaged({
    binary,
    args: ["--version"],
    provider,
    home,
    binDir,
  });
  if (versionRun.code !== 0 || !versionRun.stdout.includes(pinned.version)) {
    throw new SmokeError(
      EXIT_PREFLIGHT,
      `managed ${provider} binary does not match the pinned version`,
    );
  }
  stage("version", "ok");

  const authRun = await spawnManaged({
    binary,
    args: pinned.statusArgs,
    provider,
    home,
    binDir,
  });
  classifyAuthentication(provider, authRun.code, authRun.stdout);
  stage("authentication", "ok");

  const inference = await spawnManaged({
    binary,
    args: inferenceArgs(provider, home),
    provider,
    home,
    binDir,
  });
  if (inference.code !== 0) {
    throw new SmokeError(EXIT_FAILURE, `managed ${provider} inference failed`);
  }
  stage("inference", "ok");

  const payload = extractStructured(provider, inference.stdout, inference.truncated);
  validateAnswer(payload);
  stage("structured_output", "ok");

  process.stdout.write(`${provider} live smoke PASS\n`);
}

// --- fake binaries for --self-test -----------------------------------------

function fakeBinaryScript(provider) {
  const pinned = PINNED[provider];
  const structured = JSON.stringify({ answer: "acknowledged" });
  const statusFirst = provider === "codex" ? "login" : "auth";
  const okStatus =
    provider === "codex"
      ? "printf 'Logged in using ChatGPT\\n'"
      : `printf '{"loggedIn":true,"authMethod":"subscription"}\\n'`;
  const execFirst = provider === "codex" ? "exec" : "-p";
  const okOutput =
    provider === "codex"
      ? `printf '%s\\n' '{"type":"thread.started","thread_id":"t1"}' '{"type":"item.completed","item":{"type":"agent_message","text":${JSON.stringify(
          structured,
        )}}}' '{"type":"turn.completed"}'`
      : `printf '%s\\n' '{"type":"system","subtype":"init","tools":[],"mcp_servers":[]}' '{"type":"result","subtype":"success","is_error":false,"structured_output":${structured}}'`;

  return [
    "#!/bin/sh",
    "set -u",
    'HOMEDIR="${HOME:-}"',
    // Any credential or routing variable reaching the child fails the self-test.
    "for v in OPENAI_API_KEY ANTHROPIC_API_KEY CODEX_ACCESS_TOKEN CLAUDE_CODE_OAUTH_TOKEN CLAUDE_CODE_USE_BEDROCK AWS_ACCESS_KEY_ID NODE_OPTIONS; do",
    '  eval "value=\\${$v:-}"',
    '  if [ -n "$value" ]; then printf "leaked %s\\n" "$v" >&2; exit 91; fi',
    "done",
    'case "$1" in',
    `  --version) printf '${pinned.banner}\\n'; exit 0 ;;`,
    `  ${statusFirst}) [ "\${2:-}" = "status" ] && { ${okStatus}; exit 0; }; exit 0 ;;`,
    `  ${execFirst}) ${okOutput}; exit 0 ;;`,
    "  *) exit 64 ;;",
    "esac",
    "",
  ].join("\n");
}

async function makeFakeProvider(provider, root) {
  const home = path.join(root, provider, "home");
  const binDir = path.join(root, provider, "bin");
  await mkdir(home, { recursive: true });
  await mkdir(binDir, { recursive: true });
  const binary = path.join(binDir, provider);
  await writeFile(binary, fakeBinaryScript(provider), "utf8");
  await chmod(binary, 0o755);
  return { home, binary };
}

async function selfTest() {
  const root = await mkdtemp(path.join(tmpdir(), "meld-live-smoke-selftest-"));
  // Seed the parent with a credential sentinel: a correct managed environment
  // built from `{}` strips it, so the fakes must never see it.
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "MELD_SELFTEST_SENTINEL_MUST_NOT_LEAK";
  try {
    // The live modes must refuse without the explicit acceptance flag, whatever
    // else is configured.
    const blocked = await run(["--live", "codex"], {
      ...process.env,
      MELD_LIVE_PROVIDER_ACCEPTANCE: "",
    });
    if (blocked.code !== EXIT_BLOCKED) {
      throw new SmokeError(
        EXIT_FAILURE,
        "self-test: live mode ran without MELD_LIVE_PROVIDER_ACCEPTANCE",
      );
    }

    for (const provider of ["codex", "claude"]) {
      const { home, binary } = await makeFakeProvider(provider, root);
      await runProvider({ provider, home, binary });
    }
    process.stdout.write("live smoke self-test PASS\n");
  } finally {
    if (prior === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = prior;
    }
    await rm(root, { recursive: true, force: true });
  }
}

async function live(provider, environment) {
  if (provider !== "codex" && provider !== "claude") {
    throw new SmokeError(EXIT_USAGE, `unsupported provider: ${provider}`);
  }
  if (environment.MELD_LIVE_PROVIDER_ACCEPTANCE !== "1") {
    throw new SmokeError(
      EXIT_BLOCKED,
      "live_blocked: set MELD_LIVE_PROVIDER_ACCEPTANCE=1 to run a real provider acceptance",
    );
  }
  const homeVariable = provider === "codex" ? "MELD_CODEX_HOME" : "MELD_CLAUDE_HOME";
  const binVariable = provider === "codex" ? "MELD_CODEX_BIN" : "MELD_CLAUDE_BIN";
  const home = environment[homeVariable];
  const binary = environment[binVariable];
  if (!home || !binary) {
    throw new SmokeError(
      EXIT_BLOCKED,
      `live_blocked: set ${homeVariable} and ${binVariable} for an isolated subscription login`,
    );
  }
  await runProvider({ provider, home, binary });
}

/**
 * Runs the harness for one argv. Returns `{ code }` rather than exiting, so both
 * the CLI and the self-test can drive it. A SmokeError carries the exit code;
 * anything else is an unexpected internal failure.
 */
async function run(argv, environment = process.env) {
  try {
    if (argv.length === 1 && argv[0] === "--self-test") {
      await selfTest();
      return { code: 0 };
    }
    if (argv.length === 2 && argv[0] === "--live") {
      await live(argv[1], environment);
      return { code: 0 };
    }
    usage();
    return { code: EXIT_USAGE };
  } catch (error) {
    if (error instanceof SmokeError) {
      process.stderr.write(`${error.message}\n`);
      return { code: error.code };
    }
    process.stderr.write(`failed: ${error?.message ?? "unknown error"}\n`);
    return { code: EXIT_FAILURE };
  }
}

export {
  run,
  runProvider,
  makeFakeProvider,
  extractStructured,
  classifyAuthentication,
  PINNED,
};

// Only act as a CLI when executed directly, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { code } = await run(process.argv.slice(2));
  process.exit(code);
}
