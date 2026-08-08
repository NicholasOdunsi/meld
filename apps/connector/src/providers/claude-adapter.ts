import { readFile } from "node:fs/promises";
import type { TaskErrorCode } from "@meld/contracts";
import { taskChildEnvironment } from "../security/child-environment";
import { ProcessRunError } from "./process-runner";
import {
  classifyProviderFailure,
  fallbackRoomReplyFromProse,
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

// The one tool a content-only run is allowed to carry. The `--json-schema` flag
// installs it as the sink the reply is returned through: the init frame lists
// it, the model emits a `tool_use` naming it, and a `tool_result` turn answers
// that call. It reads nothing and runs nothing -- it only carries the structured
// reply -- so it is not a capability, and every OTHER tool, MCP server, or tool
// block remains a boundary violation.
const STRUCTURED_OUTPUT_TOOL = "StructuredOutput";

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
 *
 * `--json-schema` takes the schema inline as JSON text, not a file path --
 * unlike Codex's `--output-schema`, which does take a path. The schema is
 * already written to `responseSchemaFile` for the workspace, so it is read
 * back here rather than duplicating the JSON literal.
 */
async function claudeArguments(
  request: ProviderAdapterRequest,
): Promise<string[]> {
  const schema = await readFile(request.workspace.responseSchemaFile, "utf8");
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
    schema,
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
          args: await claudeArguments(request),
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
  // Ids of the StructuredOutput `tool_use` blocks seen so far, so the
  // `tool_result` turn that answers one is recognised as content rather than
  // a capability's output. A result for any other id is a violation.
  const structuredOutputIds = new Set<string>();
  // The model's own prose, kept separately from the streamed preview so a run
  // that never calls StructuredOutput still has a real answer to fall back
  // to. Only "assistant" turns are collected -- a "user" turn is either a
  // tool_result or the CLI's own injected reminder to call the tool, never
  // the model's answer, so including it here would post Meld's internal
  // nudge text back into the room as if the agent had written it.
  const assistantProse: string[] = [];

  for (const event of parsed.events) {
    const type = stringField(event, "type");

    if (type === "system") {
      // The init frame announces exactly which tools and MCP servers the session
      // has. A content-only run may carry the StructuredOutput sink and nothing
      // else; any other tool or any MCP server is a boundary violation, whatever
      // produced it.
      const tools = arrayField(event, "tools");
      const servers = arrayField(event, "mcp_servers");
      const unexpectedTool = tools.some(
        (tool) => tool !== STRUCTURED_OUTPUT_TOOL,
      );
      if (unexpectedTool || servers.length > 0) {
        return [providerFailure(PROVIDER, "security_boundary_violated")];
      }
      continue;
    }

    if (type === "assistant" || type === "user") {
      if (disallowedBlock(event, structuredOutputIds)) {
        return [providerFailure(PROVIDER, "security_boundary_violated")];
      }
      // No capability blocks; surface any prose as a live preview.
      for (const text of proseBlocks(event)) {
        events.push({ type: "text_delta", text });
        if (type === "assistant") {
          assistantProse.push(text);
        }
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
        // The run finished cleanly but never called StructuredOutput. If the
        // model still wrote a real answer, post that rather than sending the
        // user to "Ask again" for a reply that already exists in full.
        const fallback = fallbackRoomReplyFromProse(
          assistantProse.map(stripFunctionCallText),
          request.manifest,
          request.kind,
        );
        if (fallback) {
          events.push({ type: "completed", result: fallback });
          return events;
        }
        return [providerFailure(PROVIDER, "malformed_output")];
      }
      const verdict = validateTaskResult(
        stripFunctionCallMarkup(payload),
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

  // The run finished cleanly but never called StructuredOutput. If the model
  // still wrote a real answer, post that rather than sending the user to
  // "Ask again" for a reply that already exists in full.
  const fallback = fallbackRoomReplyFromProse(
    assistantProse.map(stripFunctionCallText),
    request.manifest,
    request.kind,
  );
  if (fallback) {
    events.push({ type: "completed", result: fallback });
    return events;
  }

  return [providerFailure(PROVIDER, "malformed_output")];
}

/**
 * Whether an assistant or user turn contains a block that is not content. `text`
 * and `thinking` are always content. The StructuredOutput `tool_use` and the
 * `tool_result` that answers it are content too -- they carry the reply, not a
 * capability -- and the first records its id in `structuredOutputIds` so the
 * second can be matched to it. A `tool_use` naming any other tool, a
 * `tool_result` for an unrecognised call, or any future block whose type names a
 * capability (`server_tool_use`, `mcp_tool_use`, `web_search_tool_result`, ...)
 * aborts the task.
 */
function disallowedBlock(
  event: Record<string, unknown>,
  structuredOutputIds: Set<string>,
): boolean {
  const message = objectField(event, "message");
  const content = message ? message.content : undefined;
  if (!Array.isArray(content)) {
    return false;
  }
  for (const block of content) {
    const blockType = stringField(block, "type");
    if (blockType === "text" || blockType === "thinking") {
      continue;
    }
    if (blockType === "tool_use") {
      if (stringField(block, "name") !== STRUCTURED_OUTPUT_TOOL) {
        return true;
      }
      const id = stringField(block, "id");
      if (id.length > 0) {
        structuredOutputIds.add(id);
      }
      continue;
    }
    if (blockType === "tool_result") {
      if (!structuredOutputIds.has(stringField(block, "tool_use_id"))) {
        return true;
      }
      continue;
    }
    if (forbiddenCapability(blockType)) {
      return true;
    }
  }
  return false;
}

// Claude sometimes appends the closing tags of its own function-call format --
// `<invoke ...>`, `</invoke>`, `<parameter ...>`, `</parameter>`,
// `<function_calls>` -- to the last structured field, so an otherwise clean
// reply arrives ending in `</parameter></invoke>`. These control tokens are
// never content, so they are removed from every string in the structured
// payload before it is validated and posted. The match is deliberately narrow:
// only the function-call tag names, so legitimate angle-bracket content a
// prototype review might quote (`<input>`, `<button>`, `<div>`) is preserved.
const FUNCTION_CALL_TAG =
  /<\/?(?:function_calls|invoke|parameter)(?:\s[^>]*)?>/gi;

function stripFunctionCallText(text: string): string {
  return text.replace(FUNCTION_CALL_TAG, "").trimEnd();
}

function stripFunctionCallMarkup(value: unknown): unknown {
  if (typeof value === "string") {
    return stripFunctionCallText(value);
  }
  if (Array.isArray(value)) {
    return value.map(stripFunctionCallMarkup);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        stripFunctionCallMarkup(item),
      ]),
    );
  }
  return value;
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
