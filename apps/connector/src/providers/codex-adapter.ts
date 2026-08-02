import type { RoomReplyResult, TaskErrorCode } from "@meld/contracts";
import { taskChildEnvironment } from "../security/child-environment";
import { ProcessRunError } from "./process-runner";
import {
  classifyProviderFailure,
  forbiddenCapability,
  objectField,
  parseProviderOutput,
  providerFailure,
  stringField,
  structuredPayload,
  validateRoomReply,
  type ProviderAdapter,
  type ProviderAdapterDependencies,
  type ProviderAdapterRequest,
  type ProviderEvent,
} from "./provider-adapter";
import { managedProviderExecutable } from "./provider-installer";
import { RELEASES } from "./release-manifest";

const PROVIDER = "codex" as const;

/**
 * The corrected, verified invocation for the pinned `@openai/codex` release.
 *
 * `exec` is already non-interactive, so the original `--ask-for-approval never`
 * is gone — it is a top-level `codex` flag and a hard parse error on `exec`.
 * `--skip-git-repo-check` is required because the task workspace is deliberately
 * not a git repository. `--sandbox read-only` governs any command execution, and
 * `--ephemeral`, `--ignore-user-config`, and `--ignore-rules` keep the run from
 * reading the user's own Codex configuration or project rules. The model is
 * pinned from the release manifest so cost and behaviour do not drift per
 * machine, and the prompt is passed positionally with stdin closed at once, or
 * Codex blocks reading additional input from stdin.
 */
function codexArguments(
  request: ProviderAdapterRequest,
  fullPrompt: string,
): string[] {
  return [
    "exec",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "--json",
    "--model",
    RELEASES.providers.codex.model,
    "--output-schema",
    request.workspace.responseSchemaFile,
    fullPrompt,
  ];
}

/**
 * The Codex event names the pre-flight observed on the pinned release:
 * `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, and
 * `error`, with completed work carried on `item.completed` items. Any item whose
 * type names a capability — a command, a tool, a patch, a file change, an MCP or
 * browser call — aborts the task; a content-only turn produces none of them.
 */
export function createCodexAdapter(
  dependencies: ProviderAdapterDependencies,
): ProviderAdapter {
  const { paths, processRunner } = dependencies;

  return {
    provider: PROVIDER,
    async run(request) {
      if (request.signal?.aborted) {
        return [providerFailure(PROVIDER, "cancelled")];
      }

      const fullPrompt = `${request.systemPrompt}\n\n${request.prompt}`;
      const executable = managedProviderExecutable(
        paths.providerCurrent(PROVIDER),
        PROVIDER,
      );

      let result;
      try {
        result = await processRunner.run({
          executable,
          args: codexArguments(request, fullPrompt),
          cwd: request.workspace.directory,
          env: taskChildEnvironment(
            paths,
            PROVIDER,
            request.workspace.directory,
          ),
          signal: request.signal,
        });
      } catch (error) {
        if (error instanceof ProcessRunError && error.reason === "aborted") {
          return [providerFailure(PROVIDER, "cancelled")];
        }
        return [providerFailure(PROVIDER, "provider_unavailable")];
      }

      if (result.aborted) {
        return [providerFailure(PROVIDER, "cancelled")];
      }

      return interpret(result, request);
    },
  };
}

function interpret(
  result: {
    stdout: string;
    stderr: string;
    code: number | null;
    stdoutTruncated: boolean;
  },
  request: ProviderAdapterRequest,
): readonly ProviderEvent[] {
  const parsed = parseProviderOutput({
    stdout: result.stdout,
    stderr: result.stderr,
    code: result.code,
    signal: null,
    aborted: false,
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: false,
  });

  if (!parsed.ok) {
    return [providerFailure(PROVIDER, parsed.code)];
  }

  // A client that produced nothing on stdout is classified from its stderr —
  // the login prompt, the usage-limit line — never echoed.
  if (parsed.events.length === 0) {
    return [
      providerFailure(PROVIDER, exitFailure(result.code, result.stderr)),
    ];
  }

  const events: ProviderEvent[] = [{ type: "progress", label: "Working" }];
  let failure: TaskErrorCode | undefined;
  let structured: RoomReplyResult | undefined;

  for (const event of parsed.events) {
    const type = stringField(event, "type");

    if (type === "error" || type === "turn.failed") {
      const detail =
        stringField(event, "message") ||
        stringField(objectField(event, "error"), "message");
      failure ??= classifyProviderFailure(`${detail} ${result.stderr}`);
      continue;
    }

    if (type === "item.started" || type === "item.completed") {
      const item = objectField(event, "item");
      const itemType = stringField(item, "type");

      if (forbiddenCapability(itemType)) {
        return [providerFailure(PROVIDER, "security_boundary_violated")];
      }

      if (itemType === "agent_message" && item) {
        const text = stringField(item, "text");
        const payload = structuredPayload(text);
        if (payload === undefined) {
          if (type === "item.completed" && text.length > 0) {
            events.push({ type: "text_delta", text });
          }
          continue;
        }
        const verdict = validateRoomReply(payload, request.manifest);
        if (!verdict.ok) {
          return [providerFailure(PROVIDER, verdict.code)];
        }
        structured = verdict.result;
      }
    }
  }

  if (structured) {
    events.push({ type: "completed", result: structured });
    return events;
  }

  return [providerFailure(PROVIDER, failure ?? "malformed_output")];
}

/** Classifies a client that exited with no events at all. */
function exitFailure(code: number | null, stderr: string): TaskErrorCode {
  if (stderr.trim().length > 0) {
    const classified = classifyProviderFailure(stderr);
    if (classified !== "unknown") {
      return classified;
    }
  }
  return code === 0 ? "malformed_output" : "provider_unavailable";
}
