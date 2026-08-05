import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AIContextPackageSchema,
  type AIContextPackage,
  type Provider,
} from "@meld/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { connectorPaths, type ConnectorPaths } from "../config/paths";
import { createClaudeAdapter } from "../providers/claude-adapter";
import { createCodexAdapter } from "../providers/codex-adapter";
import type { ProviderAdapter } from "../providers/provider-adapter";
import {
  managedProviderExecutable,
  PROVIDER_CONFIG_VARIABLE,
} from "../providers/provider-installer";
import { createProcessRunner } from "../providers/process-runner";
import { RELEASES } from "../providers/release-manifest";
import { TaskExecutor, TaskExecutionError } from "./task-executor";

/**
 * A room reply driven end to end through the **real** {@link TaskExecutor}, the
 * real provider adapters, the real {@link createProcessRunner} choke point, and
 * a real per-task workspace on disk. The only stand-ins are the provider
 * binaries themselves: temporary executables named `codex` and `claude` that
 * speak just enough of each client's structured-output protocol to exercise the
 * translation, and that fail loudly if a credential or an out-of-scope path ever
 * reaches them.
 *
 * Nothing here spawns a real `codex` or `claude`; nothing writes to
 * `~/Library/Application Support/Meld`. Every managed path is rooted in a
 * throwaway temporary directory.
 */

/**
 * A value the test seeds into every forbidden credential variable of the parent
 * process. The managed child environment is built from `{}`, so a correct
 * connector never lets this reach a provider child. The fake binary poisons the
 * run the instant it sees the token in its own environment or arguments, so a
 * regression that leaked it would fail the room reply instead of passing
 * quietly.
 */
const SENTINEL = "MELD_INTEGRATION_SENTINEL_MUST_NOT_LEAK";

/** Credential and routing variables that must never reach a provider child. */
const FORBIDDEN_PARENT_VARIABLES = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CODEX_ACCESS_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "AWS_ACCESS_KEY_ID",
  "NODE_OPTIONS",
  "HTTPS_PROXY",
] as const;

const TASK_ID = "66666666-6666-4666-8666-666666666666";
const ATTEMPT_ID = "77777777-7777-4777-8777-777777777777";
const USER_ID = "88888888-8888-4888-8888-888888888888";
const ORG_ID = "99999999-9999-4999-8999-999999999999";
const ROOM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const EVIDENCE_ID = "33333333-3333-4333-8333-333333333333";

const REPLY_TEXT = "Challenging this assumption is the priority.";

type FakeMode = "ok" | "usage_limit" | "malformed" | "tool_event" | "slow";

function roomContext(): AIContextPackage {
  return AIContextPackageSchema.parse({
    taskId: TASK_ID,
    initiatingUserId: USER_ID,
    organizationId: ORG_ID,
    roomId: ROOM_ID,
    kind: "room_reply",
    instruction: "@Product Agent challenge this assumption",
    messages: [
      {
        id: MESSAGE_ID,
        authorName: "Ada",
        text: "We should ship onboarding to everyone at once.",
        createdAt: "2026-07-29T10:00:00.000Z",
      },
    ],
    attachments: [],
    evidence: [{ id: EVIDENCE_ID, title: "Interview", note: null }],
    decisions: [],
  });
}

function shLines(lines: readonly string[]): string {
  // Every JSON line is single-quoted; none contains a single quote, so the
  // shell sees one literal argument per line.
  return `printf '%s\\n' ${lines.map((line) => `'${line}'`).join(" ")}`;
}

function taskOutput(provider: Provider): Record<FakeMode, string> {
  const replyText = JSON.stringify({
    response: REPLY_TEXT,
    citedMessageIds: [],
    citedEvidenceIds: [],
    assumptions: [],
    suggestedNextQuestions: [],
  });

  if (provider === "codex") {
    return {
      ok: shLines([
        '{"type":"thread.started","thread_id":"t1"}',
        '{"type":"turn.started"}',
        `{"type":"item.completed","item":{"type":"agent_message","text":${JSON.stringify(
          replyText,
        )}}}`,
        '{"type":"turn.completed","usage":{"input_tokens":9,"output_tokens":7}}',
      ]),
      usage_limit: shLines([
        '{"type":"thread.started","thread_id":"t1"}',
        '{"type":"error","message":"You have hit your usage limit; try again at Aug 5"}',
      ]),
      malformed: shLines(["this is not json at all"]),
      tool_event: shLines([
        '{"type":"thread.started","thread_id":"t1"}',
        '{"type":"item.completed","item":{"type":"local_shell_call","action":"run"}}',
      ]),
      slow: "/bin/sleep 30",
    };
  }

  return {
    ok: shLines([
      '{"type":"system","subtype":"init","tools":[],"mcp_servers":[]}',
      `{"type":"result","subtype":"success","is_error":false,"structured_output":${replyText}}`,
    ]),
    usage_limit: shLines([
      '{"type":"system","subtype":"init","tools":[],"mcp_servers":[]}',
      '{"type":"result","subtype":"error","is_error":true,"result":"usage limit reached"}',
    ]),
    malformed: shLines(["this is not json at all"]),
    tool_event: shLines([
      '{"type":"system","subtype":"init","tools":["Bash"],"mcp_servers":[]}',
    ]),
    slow: "/bin/sleep 30",
  };
}

/**
 * The body of the fake `codex`/`claude` binary. It records every invocation,
 * refuses to run if a credential or the sentinel token reached it, answers the
 * detector's `--version` and status probes, and emits mode-specific structured
 * output for a task run.
 */
function fakeProviderScript(provider: Provider): string {
  const version =
    provider === "codex" ? "codex-cli 0.146.0" : "2.1.220 (Claude Code)";
  const statusFirst = provider === "codex" ? "login" : "auth";
  const execFirst = provider === "codex" ? "exec" : "-p";
  const output = taskOutput(provider);
  const okAuthStatus =
    provider === "codex"
      ? "printf 'Logged in using ChatGPT\\n'"
      : `printf '{"loggedIn":true}\\n'`;
  const signedOutStatus =
    provider === "codex"
      ? "printf 'Not logged in\\n' >&2; exit 1"
      : `printf '{"loggedIn":false}\\n'; exit 0`;

  return [
    "#!/bin/sh",
    "set -u",
    `SENTINEL='${SENTINEL}'`,
    'HOMEDIR="${HOME:-}"',
    "leak() {",
    '  : > "$HOMEDIR/SENTINEL_LEAK" 2>/dev/null || true',
    "  printf 'forbidden material reached the provider child\\n' >&2",
    "  exit 91",
    "}",
    `for v in ${FORBIDDEN_PARENT_VARIABLES.join(" ")}; do`,
    '  eval "value=\\${$v:-}"',
    '  [ -n "$value" ] && leak',
    "done",
    // Catches any leaked variable, including names nobody enumerated.
    'if /usr/bin/env | /usr/bin/grep -qF "$SENTINEL"; then leak; fi',
    'for a in "$@"; do',
    '  case "$a" in *"$SENTINEL"*) leak ;; esac',
    "done",
    // A per-invocation record the test reads back from the managed provider home.
    'printf "%s\\n" "$1" >> "$HOMEDIR/calls.log"',
    '/usr/bin/env > "$HOMEDIR/last-env"',
    'MODE="ok"',
    '[ -f "$HOMEDIR/fake-mode" ] && MODE="$(/bin/cat "$HOMEDIR/fake-mode")"',
    'case "$1" in',
    `  --version) printf '${version}\\n'; exit 0 ;;`,
    `  ${statusFirst})`,
    '    if [ "${2:-}" = "status" ]; then',
    '      if [ "$MODE" = "signed_out" ]; then ' + signedOutStatus + "; fi",
    "      " + okAuthStatus + "; exit 0",
    "    fi",
    "    exit 0 ;;",
    `  ${execFirst})`,
    '    printf "%s\\n" "$@" > "$HOMEDIR/exec-args"',
    '    /usr/bin/env > "$HOMEDIR/exec-env"',
    '    case "$MODE" in',
    `      ok) ${output.ok} ;;`,
    `      usage_limit) ${output.usage_limit} ;;`,
    `      malformed) ${output.malformed} ;;`,
    `      tool_event) ${output.tool_event} ;;`,
    `      slow) ${output.slow} ;;`,
    "    esac",
    "    exit 0 ;;",
    "  *) printf 'unexpected invocation\\n' >&2; exit 64 ;;",
    "esac",
    "",
  ].join("\n");
}

interface Harness {
  paths: ConnectorPaths;
  home: string;
  codex: ProviderAdapter;
  claude: ProviderAdapter;
  setMode(provider: Provider, mode: FakeMode | "signed_out"): Promise<void>;
  read(provider: Provider, file: string): Promise<string>;
  leaked(provider: Provider): Promise<boolean>;
}

const temporaryDirectories: string[] = [];

async function makeHarness(): Promise<Harness> {
  const home = await mkdtemp(path.join(tmpdir(), "meld-task-integration-"));
  temporaryDirectories.push(home);
  const paths = connectorPaths(home);

  for (const provider of ["codex", "claude"] as const) {
    const executable = managedProviderExecutable(
      paths.providerCurrent(provider),
      provider,
    );
    await mkdir(path.dirname(executable), { recursive: true });
    await mkdir(paths.providerHome(provider), { recursive: true });
    await writeFile(executable, fakeProviderScript(provider), "utf8");
    await chmod(executable, 0o755);
  }

  const processRunner = createProcessRunner();
  return {
    paths,
    home,
    codex: createCodexAdapter({ paths, processRunner }),
    claude: createClaudeAdapter({ paths, processRunner }),
    async setMode(provider, mode) {
      await writeFile(
        path.join(paths.providerHome(provider), "fake-mode"),
        mode,
        "utf8",
      );
    },
    async read(provider, file) {
      return readFile(path.join(paths.providerHome(provider), file), "utf8");
    },
    async leaked(provider) {
      try {
        await readFile(
          path.join(paths.providerHome(provider), "SENTINEL_LEAK"),
          "utf8",
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}

function executor(harness: Harness, timeoutMs?: number): TaskExecutor {
  return new TaskExecutor({
    paths: harness.paths,
    adapters: { codex: harness.codex, claude: harness.claude },
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

function payload(provider: Provider) {
  return {
    taskId: TASK_ID,
    attemptId: ATTEMPT_ID,
    provider,
    context: roomContext(),
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("task executor against fake provider binaries", () => {
  it.each(["codex", "claude"] as const)(
    "runs a %s room reply through the real adapter and process runner",
    async (provider) => {
      const harness = await makeHarness();
      const events: string[] = [];

      const envelope = await executor(harness).execute(
        payload(provider),
        undefined,
        (event) => {
          events.push(event.type);
        },
      );

      expect(envelope).toEqual({
        kind: "room_reply",
        payload: {
          response: REPLY_TEXT,
          citedMessageIds: [],
          citedEvidenceIds: [],
          assumptions: [],
          suggestedNextQuestions: [],
        },
        partial: false,
      });
      // A progress frame is emitted before the terminal result.
      expect(events).toContain("progress");
      expect(await harness.leaked(provider)).toBe(false);
    },
  );

  it.each([
    ["codex", "gpt-5.5"],
    ["claude", "claude-opus-4-8"],
  ] as const)(
    "passes the pinned %s model and the workspace schema file on argv",
    async (provider, model) => {
      const harness = await makeHarness();
      await executor(harness).execute(payload(provider), undefined, () => {});

      const args = (await harness.read(provider, "exec-args")).split("\n");
      expect(args).toContain("--model");
      expect(args).toContain(model);
      expect(RELEASES.providers[provider].model).toBe(model);
      if (provider === "codex") {
        // Codex's `--output-schema` reads the schema from the workspace file.
        expect(
          args.some((arg) => arg.endsWith("/response-schema.json")),
        ).toBe(true);
      } else {
        // Claude's `--json-schema` takes the schema inline as JSON text, not a
        // path, so the workspace schema arrives as a parseable object on argv.
        const flag = args.indexOf("--json-schema");
        expect(flag).toBeGreaterThanOrEqual(0);
        const inlineSchema = JSON.parse(args[flag + 1]) as unknown;
        expect(typeof inlineSchema).toBe("object");
        expect(inlineSchema).not.toBeNull();
      }
    },
  );

  it.each(["codex", "claude"] as const)(
    "gives the %s child only the managed environment, never a credential",
    async (provider) => {
      const harness = await makeHarness();
      const priorEnvironment = { ...process.env };
      for (const name of FORBIDDEN_PARENT_VARIABLES) {
        process.env[name] = SENTINEL;
      }

      try {
        const envelope = await executor(harness).execute(
          payload(provider),
          undefined,
          () => {},
        );
        expect(envelope.kind).toBe("room_reply");
      } finally {
        for (const name of FORBIDDEN_PARENT_VARIABLES) {
          if (priorEnvironment[name] === undefined) {
            delete process.env[name];
          } else {
            process.env[name] = priorEnvironment[name];
          }
        }
      }

      expect(await harness.leaked(provider)).toBe(false);
      const childEnvironment = await harness.read(provider, "exec-env");
      expect(childEnvironment).not.toContain(SENTINEL);
      for (const name of FORBIDDEN_PARENT_VARIABLES) {
        expect(childEnvironment).not.toContain(`${name}=`);
      }
      // The workspace is the child's own TMPDIR, and its config home is the
      // managed provider home -- both inside the throwaway managed tree.
      expect(childEnvironment).toContain(`TMPDIR=${harness.paths.tasksRoot}`);
      expect(childEnvironment).toContain(
        `HOME=${harness.paths.providerHome(provider)}`,
      );
      expect(childEnvironment).toContain(
        `${PROVIDER_CONFIG_VARIABLE[provider]}=${harness.paths.providerHome(
          provider,
        )}`,
      );
    },
  );

  it("classifies a usage-limit run without echoing provider text", async () => {
    const harness = await makeHarness();
    await harness.setMode("codex", "usage_limit");

    await expect(
      executor(harness).execute(payload("codex"), undefined, () => {}),
    ).rejects.toMatchObject({
      name: "TaskExecutionError",
      code: "usage_limit_reached",
    });
  });

  it("rejects malformed provider output as malformed", async () => {
    const harness = await makeHarness();
    await harness.setMode("claude", "malformed");

    await expect(
      executor(harness).execute(payload("claude"), undefined, () => {}),
    ).rejects.toMatchObject({ code: "malformed_output" });
  });

  it.each(["codex", "claude"] as const)(
    "aborts a %s run that reaches for a capability",
    async (provider) => {
      const harness = await makeHarness();
      await harness.setMode(provider, "tool_event");

      await expect(
        executor(harness).execute(payload(provider), undefined, () => {}),
      ).rejects.toMatchObject({ code: "security_boundary_violated" });
    },
  );

  it("stops a provider that never finishes and reports it unavailable", async () => {
    const harness = await makeHarness();
    await harness.setMode("codex", "slow");

    await expect(
      executor(harness, 250).execute(payload("codex"), undefined, () => {}),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  it("cancels a running provider through the abort signal", async () => {
    const harness = await makeHarness();
    await harness.setMode("claude", "slow");
    const controller = new AbortController();

    const running = executor(harness)
      .execute(payload("claude"), controller.signal, () => {})
      .catch((error: unknown) => error);
    // Give the child time to spawn before the cancellation reaches it.
    await new Promise((resolve) => setTimeout(resolve, 100));
    controller.abort();

    const error = await running;
    expect(error).toBeInstanceOf(TaskExecutionError);
    expect(error).toMatchObject({ code: "cancelled" });
  });
});
