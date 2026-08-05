import {
  MAX_RESULT_BYTES,
  PRDDocumentSchema,
  RoomReplyResultSchema,
  type PRDDocument,
  type Provider,
  type RoomReplyResult,
  type TaskErrorCode,
} from "@meld/contracts";
import type { ConnectorPaths } from "../config/paths";
import type { TaskWorkspace } from "../security/task-workspace";
import type { ContextManifest } from "../tasks/product-agent-prompt";
import type { ProcessResult, ProcessRunner } from "./process-runner";

/**
 * What one managed provider run produced, in Meld's own vocabulary. Adapters
 * translate every provider dialect into this; nothing downstream ever sees a
 * provider's own event names, text, or error strings.
 */
export type ProviderEvent =
  | { type: "progress"; label: string; percent?: number }
  | { type: "text_delta"; text: string }
  | { type: "completed"; result: unknown }
  | { type: "failed"; code: TaskErrorCode; message: string };

/**
 * How many events one run may emit before Meld stops believing it is a room
 * reply. A content-only turn produces a handful; hundreds means the client is
 * doing something a content-only turn does not do.
 */
export const MAX_PROVIDER_EVENTS = 200;

/**
 * How much provider output Meld will interpret. Anything larger cannot become a
 * valid result anyway — the result envelope itself is capped at this size — so
 * it is rejected before it is parsed rather than after.
 */
export const MAX_PROVIDER_OUTPUT_BYTES = MAX_RESULT_BYTES;

export interface ProviderAdapterRequest {
  workspace: TaskWorkspace;
  /** The untrusted half of the prompt: Meld's instruction line plus JSON data. */
  prompt: string;
  /** The versioned Product Agent instructions. */
  systemPrompt: string;
  /** The identifiers this reply is allowed to cite. */
  manifest: ContextManifest;
  /** Defaults to room_reply for direct adapter callers kept for compatibility. */
  kind?: "room_reply" | "prd_generate" | "prd_revise";
  signal?: AbortSignal;
}

export interface ProviderAdapter {
  readonly provider: Provider;
  run(request: ProviderAdapterRequest): Promise<readonly ProviderEvent[]>;
}

export interface ProviderAdapterDependencies {
  paths: ConnectorPaths;
  /** The single choke point for provider process control. */
  processRunner: ProcessRunner;
}

/**
 * Substrings that mark an event as a capability rather than content.
 *
 * They are matched against event and item *type* names only — never against a
 * model's prose — so a reply that mentions the word "shell" is content while an
 * event of type `local_shell_call` is a boundary violation. Matching on
 * substrings rather than an enumerated list is deliberate: a provider release
 * that adds `some_new_tool_call` is caught by the same rule that catches
 * `mcp_tool_call`, without Meld having to have heard of it first.
 *
 * `read` is *not* a marker: it appears inside `thread.started`, which is the
 * ordinary first event of every Codex run.
 */
const CAPABILITY_MARKERS: readonly string[] = [
  "tool",
  "command",
  "exec",
  "shell",
  "bash",
  "patch",
  "file",
  "write",
  "edit",
  "mcp",
  "browser",
  "web",
  "search",
  "fetch",
  "terminal",
  "computer",
];

export function forbiddenCapability(type: string): boolean {
  const normalized = type.toLowerCase();
  return CAPABILITY_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * The message Meld reports for each failure.
 *
 * These are Meld's words, never the provider's. A provider's own error text can
 * quote the prompt, the room, or a credential path back at us, and the whole of
 * this feature forbids emitting any of those, so provider text is used only to
 * *classify* a failure and is then discarded.
 */
export function failureMessage(
  provider: Provider,
  code: TaskErrorCode,
): string {
  switch (code) {
    case "authentication_required":
      return `The managed ${provider} client is not signed in.`;
    case "usage_limit_reached":
      return `The managed ${provider} subscription has reached its usage limit.`;
    case "provider_unavailable":
      return `The managed ${provider} client could not complete this reply.`;
    case "malformed_output":
      return `The managed ${provider} client did not return a valid room reply.`;
    case "security_boundary_violated":
      return `The managed ${provider} client attempted an action outside Meld's content-only boundary.`;
    case "cancelled":
      return "The room reply was cancelled.";
    default:
      return `The managed ${provider} client failed for an unknown reason.`;
  }
}

export function providerFailure(
  provider: Provider,
  code: TaskErrorCode,
): ProviderEvent {
  return { type: "failed", code, message: failureMessage(provider, code) };
}

/**
 * Sorts a provider's own failure text into a Meld error code. The text itself
 * never leaves this function.
 */
const CLASSIFIERS: readonly [RegExp, TaskErrorCode][] = [
  [
    /usage limit|rate limit|rate_limit|quota|429|too many requests|try again (at|in|after)/i,
    "usage_limit_reached",
  ],
  [
    /not logged in|logged out|\/login|log in|sign in|unauthori[sz]ed|authenticat|invalid api key|credential|401\b|403\b/i,
    "authentication_required",
  ],
  [
    /unavailable|overloaded|5\d\d\b|network|econn|enotfound|etimedout|timed out|offline|connection|dns/i,
    "provider_unavailable",
  ],
];

export function classifyProviderFailure(text: string): TaskErrorCode {
  for (const [shape, code] of CLASSIFIERS) {
    if (shape.test(text)) {
      return code;
    }
  }
  return "unknown";
}

export type RoomReplyVerdict =
  | { ok: true; result: RoomReplyResult }
  | { ok: false; code: TaskErrorCode };

/**
 * The one place a provider's structured output becomes a Meld result: it must
 * parse against the shared contract, and it may only cite identifiers the frozen
 * context manifest actually contained. A citation outside the manifest means the
 * reply refers to content the task was never authorized to see, which is a
 * boundary violation rather than a formatting mistake.
 */
export function validateRoomReply(
  value: unknown,
  manifest: ContextManifest,
): RoomReplyVerdict {
  const parsed = RoomReplyResultSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, code: "malformed_output" };
  }

  // Every id the frozen context contained is citable, whichever citation array
  // the model puts it in. Attachments in particular have no citation array of
  // their own, so a reply reviewing an attached brief cites its id under
  // citedEvidenceIds; that is authorized content, not a boundary breach. An id
  // that is in no set at all is content the task was never shown -- the real
  // violation this guards against.
  const authorized = new Set<string>([
    ...manifest.messageIds,
    ...manifest.evidenceIds,
    ...manifest.attachmentIds,
    ...manifest.decisionIds,
  ]);
  const citedOutsideContext = [
    ...parsed.data.citedMessageIds,
    ...parsed.data.citedEvidenceIds,
  ].some((id) => !authorized.has(id));
  if (citedOutsideContext) {
    return { ok: false, code: "security_boundary_violated" };
  }

  return { ok: true, result: parsed.data };
}

export type TaskResultVerdict =
  | { ok: true; result: RoomReplyResult | PRDDocument }
  | { ok: false; code: TaskErrorCode };

/** Validates the structured payload before a provider adapter emits it. */
export function validateTaskResult(
  value: unknown,
  manifest: ContextManifest,
  kind: "room_reply" | "prd_generate" | "prd_revise" = "room_reply",
): TaskResultVerdict {
  if (kind === "room_reply") {
    return validateRoomReply(value, manifest);
  }

  const parsed = PRDDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, code: "malformed_output" };
  }
  const citesOutsideContext = parsed.data.decisionHistory.some((item) =>
    item.sourceMessageIds.some((id) => !manifest.messageIds.has(id)),
  );
  if (citesOutsideContext) {
    return { ok: false, code: "security_boundary_violated" };
  }
  return { ok: true, result: parsed.data };
}

/**
 * Whether an agent message is the structured payload rather than prose. With a
 * response schema in force the final message *is* the JSON result, and streaming
 * that to the room as a live preview would show people raw JSON.
 */
export function structuredPayload(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(trimmed);
    return typeof value === "object" && value !== null ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Reads a string field out of an unknown event without trusting its shape. */
export function stringField(value: unknown, ...names: string[]): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }
  const record = value as Record<string, unknown>;
  for (const name of names) {
    const field = record[name];
    if (typeof field === "string") {
      return field;
    }
  }
  return "";
}

export function objectField(
  value: unknown,
  name: string,
): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[name];
  return typeof field === "object" && field !== null
    ? (field as Record<string, unknown>)
    : undefined;
}

export type ParsedOutput =
  | { ok: true; events: readonly Record<string, unknown>[] }
  | { ok: false; code: TaskErrorCode };

/**
 * Turns a provider's stdout into events, refusing anything Meld cannot fully
 * account for: output too large to be a reply, output the runner had to
 * truncate, a line that is not a JSON object, or more events than one turn is
 * allowed. Partial understanding of a provider's output is not a safe basis for
 * posting a message into a room, so each of these aborts the task.
 */
export function parseProviderOutput(result: ProcessResult): ParsedOutput {
  if (
    result.stdoutTruncated ||
    Buffer.byteLength(result.stdout, "utf8") > MAX_PROVIDER_OUTPUT_BYTES
  ) {
    return { ok: false, code: "malformed_output" };
  }

  const lines = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length > MAX_PROVIDER_EVENTS) {
    return { ok: false, code: "malformed_output" };
  }

  const events: Record<string, unknown>[] = [];
  for (const line of lines) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      return { ok: false, code: "malformed_output" };
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ok: false, code: "malformed_output" };
    }
    events.push(value as Record<string, unknown>);
  }

  return { ok: true, events };
}
