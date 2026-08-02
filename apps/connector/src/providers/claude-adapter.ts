import type { TaskErrorCode } from "@meld/contracts";
import { taskChildEnvironment } from "../security/child-environment";
import { ProcessRunError } from "./process-runner";
import {
  classifyProviderFailure,
  forbiddenCapability,
  objectField,
  parseProviderOutput,
  providerFailure,
  stringField,
  validateTaskResult,
  type ProviderAdapter,
  type ProviderAdapterDependencies,
  type ProviderAdapterRequest,
  type ProviderEvent,
  type TaskResultVerdict,
} from "./provider-adapter";
import { managedProviderExecutable } from "./provider-installer";
import { RELEASES } from "./release-manifest";

const PROVIDER = "claude" as const;

/**
 * The corrected, verified invocation for the pinned `@anthropic-ai/claude-code`
 * release.
 *
 * `--bare` is deliberately absent: under it Claude reads only `ANTHROPIC_API_KEY`
 * or an apiKeyHelper and never the OAuth/keychain login, so it could not use the
 * managed subscription and would require the very API key Meld forbids reaching a
 * child. The isolation instead comes from `--tools ""` (no tools),
 * `--disable-slash-commands`, `--strict-mcp-config` with the workspace's empty
 * MCP file (no servers), and `--no-session-persistence`. `--output-format
 * stream-json` requires `--verbose`. The model is pinned from the release
 * manifest, the Product Agent instructions ride on `--system-prompt`, and the
 * untrusted room data is the final positional argument.
 */
function claudeArguments(request: ProviderAdapterRequest): string[] {
  return [
    "-p",
    "--tools",
    "",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--mcp-config",
    request.workspace.mcpConfigFile,
    "--no-session-persistence",
    "--output-format",
    "stream-json",
    "--verbose",
    "--json-schema",
    request.workspace.responseSchemaFile,
    "--model",
    RELEASES.providers.claude.model,
    "--system-prompt",
    request.systemPrompt,
    request.prompt,
  ];
}

export function createClaudeAdapter(
  dependencies: ProviderAdapterDependencies,
): ProviderAdapter {
  const { paths, processRunner } = dependencies;

  return {
    provider: PROVIDER,
    async run(request) {
      if (request.signal?.aborted) {
        return [providerFailure(PROVIDER, "cancelled")];
      }

      const executable = managedProviderExecutable(
        paths.providerCurrent(PROVIDER),
        PROVIDER,
      );

      let result;
      try {
        result = await processRunner.run({
          executable,
          args: claudeArguments(request),
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

  if (parsed.events.length === 0) {
    return [
      providerFailure(PROVIDER, exitFailure(result.code, result.stderr)),
    ];
  }

  const events: ProviderEvent[] = [{ type: "progress", label: "Working" }];
  let structured: Extract<TaskResultVerdict, { ok: true }>["result"] | undefined;

  for (const event of parsed.events) {
    const type = stringField(event, "type");

    if (type === "system") {
      // The init frame announces exactly which tools and MCP servers the session
      // has. A content-only run must report none; anything else is a boundary
      // violation, whatever produced it.
      const tools = arrayField(event, "tools");
      const servers = arrayField(event, "mcp_servers");
      if (tools.length > 0 || servers.length > 0) {
        return [providerFailure(PROVIDER, "security_boundary_violated")];
      }
      continue;
    }

    if (type === "assistant" || type === "user") {
      if (containsToolBlock(event)) {
        return [providerFailure(PROVIDER, "security_boundary_violated")];
      }
      // No tool blocks; surface any prose as a live preview.
      for (const text of proseBlocks(event)) {
        events.push({ type: "text_delta", text });
      }
      continue;
    }

    if (type === "result") {
      if (
        stringField(event, "subtype") !== "success" ||
        event.is_error === true
      ) {
        const detail =
          stringField(event, "result") || stringField(event, "error");
        return [
          providerFailure(
            PROVIDER,
            classifyProviderFailure(`${detail} ${result.stderr}`),
          ),
        ];
      }
      const payload = event.structured_output;
      if (payload === undefined) {
        return [providerFailure(PROVIDER, "malformed_output")];
      }
      const verdict = validateTaskResult(
        payload,
        request.manifest,
        request.kind,
      );
      if (!verdict.ok) {
        return [providerFailure(PROVIDER, verdict.code)];
      }
      structured = verdict.result;
    }
  }

  if (structured) {
    events.push({ type: "completed", result: structured });
    return events;
  }

  return [providerFailure(PROVIDER, "malformed_output")];
}

/**
 * Whether an assistant or user turn contains a tool block. A `tool_use`,
 * `server_tool_use`, `mcp_tool_use`, tool result, or any future block whose type
 * names a capability aborts the task; only `text` blocks are content.
 */
function containsToolBlock(event: Record<string, unknown>): boolean {
  const message = objectField(event, "message");
  const content = message ? message.content : undefined;
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some((block) => {
    const blockType = stringField(block, "type");
    return blockType !== "text" && forbiddenCapability(blockType);
  });
}

function proseBlocks(event: Record<string, unknown>): string[] {
  const message = objectField(event, "message");
  const content = message ? message.content : undefined;
  if (!Array.isArray(content)) {
    return [];
  }
  const texts: string[] = [];
  for (const block of content) {
    if (stringField(block, "type") === "text") {
      const text = stringField(block, "text");
      if (text.length > 0) {
        texts.push(text);
      }
    }
  }
  return texts;
}

function arrayField(value: Record<string, unknown>, name: string): unknown[] {
  const field = value[name];
  return Array.isArray(field) ? field : [];
}

function exitFailure(code: number | null, stderr: string): TaskErrorCode {
  if (stderr.trim().length > 0) {
    const classified = classifyProviderFailure(stderr);
    if (classified !== "unknown") {
      return classified;
    }
  }
  return code === 0 ? "malformed_output" : "provider_unavailable";
}
