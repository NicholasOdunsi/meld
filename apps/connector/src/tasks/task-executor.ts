import {
  AIContextPackageSchema,
  DesignProfileSchema,
  MAX_ACTIVE_TASKS,
  PRDDocumentSchema,
  PrdAssistScopeSchema,
  isPrdFieldName,
  parsePrdSectionAssistance,
  parsePrdSectionRevision,
  RoomReplyResultSchema,
  FlowDocumentSchema,
  TaskEventSchema,
  type AIContextPackage,
  type DesignProfileDistillResult,
  type PrdAssistScope,
  type PrdSectionAssistResult,
  type Provider,
  type TaskErrorCode,
  type TaskEvent,
} from "@meld/contracts";
import {
  compileTokenCss,
  DesignScreenBatchSchema,
  type DesignScreenBatch,
} from "@meld/prototype";
import type { ConnectorPaths } from "../config/paths";
import {
  parseRoomReplyResult,
  type ProviderAdapter,
} from "../providers/provider-adapter";
import {
  createTaskWorkspace,
  type TaskWorkspace,
  type TaskWorkspaceContents,
} from "../security/task-workspace";
import {
  buildProductAgentInput,
  contextManifest,
  PRODUCT_AGENT_SYSTEM_PROMPT,
  PRODUCT_AGENT_PROMPT_VERSION,
  renderRoomContextPrompt,
  roomReplyResponseSchema,
} from "./product-agent-prompt";
import {
  buildDesignProfileDistillSystemPrompt,
  DESIGN_PROFILE_DISTILL_PROMPT_VERSION,
  DESIGN_PROFILE_DISTILL_RESPONSE_SCHEMA,
  DESIGN_PROFILE_DISTILL_SYSTEM_PROMPT,
} from "./design-profile-distill-prompt";
import {
  DESIGN_SCREEN_GENERATE_PROMPT_VERSION,
  DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA,
  DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT,
  buildDesignScreenSystemPrompt,
} from "./design-screen-generate-prompt";
import {
  PRD_GENERATE_PROMPT_VERSION,
  PRD_GENERATE_RESPONSE_SCHEMA,
  PRD_GENERATE_SYSTEM_PROMPT,
} from "./prd-generate-prompt";
import {
  PRD_REVISE_PROMPT_VERSION,
  PRD_REVISE_RESPONSE_SCHEMA,
  PRD_REVISE_SYSTEM_PROMPT,
} from "./prd-revise-prompt";
import {
  PRD_SECTION_REVISE_PROMPT_VERSION,
  PRD_SECTION_REVISE_SYSTEM_PROMPT,
  prdSectionReviseResponseSchema,
} from "./prd-section-revise-prompt";
import {
  PRD_SECTION_ASSIST_PROMPT_VERSION,
  PRD_SECTION_ASSIST_SYSTEM_PROMPT,
  prdSectionAssistResponseSchema,
} from "./prd-section-assist-prompt";
import {
  researchAgentPromptVersion,
  researchAgentSystemPrompt,
  researchRoomReplyResponseSchema,
} from "./research-agent-prompt";
import {
  USER_FLOW_GENERATE_PROMPT_VERSION,
  USER_FLOW_GENERATE_RESPONSE_SCHEMA,
  USER_FLOW_GENERATE_SYSTEM_PROMPT,
} from "./user-flow-generate-prompt";

/**
 * How long one provider run may take before Meld stops waiting. `ProcessRunner`
 * has no timeout of its own, and an `AbortSignal` alone never reaches it, so the
 * executor owns this: on expiry it aborts the run's own controller, which both
 * terminates the process group and settles the run.
 */
export const DEFAULT_TASK_TIMEOUT_MS = 5 * 60 * 1_000;

/**
 * design_screen_generate renders whole screens of markup with a reasoning
 * model, which routinely runs past the default 5-minute ceiling and gets
 * killed mid-generation (`provider_unavailable`). It is given a longer ceiling
 * of its own so a legitimately slow render is allowed to finish.
 */
export const DESIGN_SCREEN_GENERATE_TIMEOUT_MS = 12 * 60 * 1_000;

/**
 * How many events one task may forward to the gateway. A content-only reply
 * needs a handful; a bound here keeps a misbehaving provider from flooding the
 * socket. Events past the bound are dropped, never buffered.
 */
export const MAX_TASK_EVENTS = 64;

/**
 * Everything one task kind needs to run. Declaring it as a type rather than
 * inferring it lets each entry take only the arguments it actually reads: a
 * kind whose schema is fixed writes no parameters at all instead of naming
 * ones it ignores.
 */
interface TaskKindConfig {
  readonly promptVersion: string;
  readonly systemPrompt: string;
  readonly responseSchema: (
    provider: Provider,
    context: AIContextPackage,
  ) => Readonly<Record<string, unknown>>;
  readonly parseResult: (
    result: unknown,
    context: AIContextPackage,
  ) => TaskResultEnvelope["payload"];
  readonly envelopeKind: TaskResultEnvelope["kind"];
  /**
   * How long this kind's provider run may take before Meld stops waiting.
   * Omitted kinds fall back to {@link DEFAULT_TASK_TIMEOUT_MS}; an explicit
   * dependency timeout (tests) still overrides both.
   */
  readonly timeoutMs?: number;
}

/**
 * The frozen selection a `prd_section_assist` task asks about. It is the only
 * thing a proposal may target, so a task without a valid one cannot be run at
 * all — the response schema itself is built from it.
 */
function assistScope(context: AIContextPackage): PrdAssistScope {
  const scope = PrdAssistScopeSchema.safeParse(context.prdAssistScope);
  if (!scope.success) {
    throw new TaskExecutionError(
      "malformed_output",
      "The PRD assistance task is missing its selected sections.",
    );
  }
  return scope.data;
}

/**
 * A room reply parsed the way the database settles one: the answer and the
 * proposal it carries stand or fall separately. A bare
 * `RoomReplyResultSchema.parse` throws on the whole payload when only
 * `proposedAction` is bad, which reaches the caller as `malformed_output` and
 * leaves the task `needs_review` with no message posted -- while SQL, given the
 * same payload, would have posted the reply and nulled just the proposal.
 */
function parsedRoomReply(result: unknown) {
  const parsed = parseRoomReplyResult(result);
  if (!parsed) {
    throw new Error("Invalid room reply result.");
  }
  return parsed;
}

const TASK_CONFIG = {
  room_reply: {
    promptVersion: PRODUCT_AGENT_PROMPT_VERSION,
    systemPrompt: PRODUCT_AGENT_SYSTEM_PROMPT,
    responseSchema: (provider: Provider) => roomReplyResponseSchema(provider),
    // The tolerant parse, not a bare `.parse`: a proposal the contract rejects
    // must cost the user the proposal, never the answer. The adapter has
    // already applied the same rule; this is the second gate and has to agree
    // with it, or a payload the adapter rescued dies here instead.
    parseResult: (result: unknown) => parsedRoomReply(result),
    envelopeKind: "room_reply" as const,
  },
  prd_generate: {
    promptVersion: PRD_GENERATE_PROMPT_VERSION,
    systemPrompt: PRD_GENERATE_SYSTEM_PROMPT,
    responseSchema: () => PRD_GENERATE_RESPONSE_SCHEMA,
    parseResult: (result: unknown) => PRDDocumentSchema.parse(result),
    envelopeKind: "prd_generate" as const,
  },
  prd_revise: {
    promptVersion: PRD_REVISE_PROMPT_VERSION,
    systemPrompt: PRD_REVISE_SYSTEM_PROMPT,
    responseSchema: () => PRD_REVISE_RESPONSE_SCHEMA,
    parseResult: (result: unknown) => PRDDocumentSchema.parse(result),
    envelopeKind: "prd_revise" as const,
  },
  // The original edit-only kind. Kept exactly as it was so a task queued before
  // prd_section_assist shipped still runs to completion.
  prd_section_revise: {
    promptVersion: PRD_SECTION_REVISE_PROMPT_VERSION,
    systemPrompt: PRD_SECTION_REVISE_SYSTEM_PROMPT,
    responseSchema: (_provider: Provider, context: AIContextPackage) => {
      const field = context.targetSection?.field;
      if (!field || !isPrdFieldName(field)) {
        throw new TaskExecutionError(
          "malformed_output",
          "The PRD section task is missing its target field.",
        );
      }
      return prdSectionReviseResponseSchema(field);
    },
    parseResult: (result: unknown, context: AIContextPackage) => {
      const field = context.targetSection?.field;
      if (!field || !isPrdFieldName(field)) {
        throw new Error("Missing PRD section target.");
      }
      const parsed = parsePrdSectionRevision(field, result);
      if (!parsed.ok) {
        throw new Error("Invalid PRD section result.");
      }
      return { value: parsed.value };
    },
    envelopeKind: "prd_section_revise" as const,
  },
  prd_section_assist: {
    promptVersion: PRD_SECTION_ASSIST_PROMPT_VERSION,
    systemPrompt: PRD_SECTION_ASSIST_SYSTEM_PROMPT,
    responseSchema: (provider: Provider, context: AIContextPackage) =>
      prdSectionAssistResponseSchema(provider, assistScope(context)),
    parseResult: (result: unknown, context: AIContextPackage) => {
      // The scope is re-applied to the result: only a field the user actually
      // selected may be proposed, only an editor may propose at all, and the
      // value must parse against that field's own PRD schema.
      const parsed = parsePrdSectionAssistance(assistScope(context), result);
      if (!parsed.ok) {
        throw new Error("Invalid PRD section assistance result.");
      }
      return parsed.value;
    },
    envelopeKind: "prd_section_assist" as const,
  },
  user_flow_generate: {
    promptVersion: USER_FLOW_GENERATE_PROMPT_VERSION,
    systemPrompt: USER_FLOW_GENERATE_SYSTEM_PROMPT,
    responseSchema: () => USER_FLOW_GENERATE_RESPONSE_SCHEMA,
    parseResult: (result: unknown) => FlowDocumentSchema.parse(result),
    envelopeKind: "user_flow_generate" as const,
  },
  design_profile_distill: {
    promptVersion: DESIGN_PROFILE_DISTILL_PROMPT_VERSION,
    systemPrompt: DESIGN_PROFILE_DISTILL_SYSTEM_PROMPT,
    responseSchema: () => DESIGN_PROFILE_DISTILL_RESPONSE_SCHEMA,
    parseResult: (result: unknown): DesignProfileDistillResult => {
      const profile = DesignProfileSchema.parse(result);
      return { profile, tokenCss: compileTokenCss(profile) };
    },
    envelopeKind: "design_profile_distill" as const,
  },
  design_screen_generate: {
    promptVersion: DESIGN_SCREEN_GENERATE_PROMPT_VERSION,
    systemPrompt: DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT,
    responseSchema: () => DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA,
    parseResult: (result: unknown): DesignScreenBatch =>
      DesignScreenBatchSchema.parse(result),
    envelopeKind: "design_screen_generate" as const,
    timeoutMs: DESIGN_SCREEN_GENERATE_TIMEOUT_MS,
  },
} satisfies Record<string, TaskKindConfig>;

type ExecutableTaskKind = keyof typeof TASK_CONFIG;

/** The task kinds this connector can actually execute today. */
export const EXECUTABLE_KINDS: ReadonlySet<string> = new Set(
  Object.keys(TASK_CONFIG),
);

function executableTaskKind(kind: string): kind is ExecutableTaskKind {
  return EXECUTABLE_KINDS.has(kind);
}

function taskConfigFor(context: AIContextPackage): TaskKindConfig {
  if (context.kind === "room_reply" && context.agentKind === "research") {
    return {
      promptVersion: researchAgentPromptVersion(context.researchScope),
      systemPrompt: researchAgentSystemPrompt(context.researchScope),
      responseSchema: (provider: Provider) =>
        researchRoomReplyResponseSchema(provider, context.researchScope),
      parseResult: (result: unknown) => ({
        ...parsedRoomReply(result),
        proposedAction: null,
      }),
      envelopeKind: "room_reply",
    };
  }
  if (context.kind === "design_profile_distill") {
    return {
      ...TASK_CONFIG.design_profile_distill,
      systemPrompt: buildDesignProfileDistillSystemPrompt(context),
    };
  }
  if (context.kind === "design_screen_generate") {
    return {
      ...TASK_CONFIG.design_screen_generate,
      systemPrompt: buildDesignScreenSystemPrompt(context),
    };
  }
  return TASK_CONFIG[context.kind as ExecutableTaskKind];
}

export class TaskExecutionError extends Error {
  override readonly name = "TaskExecutionError";
  readonly code: TaskErrorCode;

  constructor(code: TaskErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** The validated envelope a completed task settles the gateway with. */
export interface TaskResultEnvelope {
  kind:
    | "room_reply"
    | "prd_generate"
    | "prd_revise"
    | "prd_section_revise"
    | "prd_section_assist"
    | "user_flow_generate"
    | "design_profile_distill"
    | "design_screen_generate";
  payload:
    | ReturnType<typeof RoomReplyResultSchema.parse>
    | ReturnType<typeof PRDDocumentSchema.parse>
    | PrdSectionAssistResult
    | { value: unknown }
    | ReturnType<typeof FlowDocumentSchema.parse>
    | DesignProfileDistillResult
    | DesignScreenBatch;
  partial: false;
}

export interface TaskPayload {
  taskId: string;
  attemptId: string;
  provider: Provider;
  model?: string | null;
  context: AIContextPackage;
}

export type TaskEmit = (event: TaskEvent) => void;

export type CreateWorkspace = (
  taskId: string,
  attemptId: string,
  contents: TaskWorkspaceContents,
) => Promise<TaskWorkspace>;

export interface TaskExecutorDependencies {
  paths: ConnectorPaths;
  adapters: Readonly<Partial<Record<Provider, ProviderAdapter>>>;
  timeoutMs?: number;
  /** Injectable so no test writes into a real managed directory. */
  createWorkspace?: CreateWorkspace;
}

function workspaceKey(taskId: string, attemptId: string): string {
  return `${taskId}\u0000${attemptId}`;
}

/**
 * Runs one supported task end to end: builds the per-task workspace and the
 * versioned content-only prompt, runs the adapter for the requested provider,
 * translates the adapter's events into bounded contract `TaskEvent`s, and
 * returns a validated, non-partial task envelope. It settles a failure
 * as a typed {@link TaskExecutionError} carrying only a Meld error code — never
 * provider text, room content, or the prompt.
 *
 * The workspace is kept after the run so a completed reply's context survives
 * until the gateway acknowledges the terminal frame; {@link cleanup} disposes it
 * then.
 */
export class TaskExecutor {
  private readonly paths: ConnectorPaths;
  private readonly adapters: Readonly<
    Partial<Record<Provider, ProviderAdapter>>
  >;
  /**
   * An explicit ceiling that overrides every kind's own timeout when set
   * (tests inject a tiny one). Left undefined, each kind falls back to its
   * configured {@link TaskKindConfig.timeoutMs} or {@link DEFAULT_TASK_TIMEOUT_MS}.
   */
  private readonly timeoutOverrideMs?: number;
  private readonly createWorkspace: CreateWorkspace;
  private readonly workspaces = new Map<string, TaskWorkspace>();

  constructor(dependencies: TaskExecutorDependencies) {
    this.paths = dependencies.paths;
    this.adapters = dependencies.adapters;
    this.timeoutOverrideMs = dependencies.timeoutMs;
    this.createWorkspace =
      dependencies.createWorkspace ??
      ((taskId, attemptId, contents) =>
        createTaskWorkspace(this.paths, taskId, attemptId, contents));
  }

  async execute(
    payload: TaskPayload,
    signal: AbortSignal | undefined,
    emit: TaskEmit,
  ): Promise<TaskResultEnvelope> {
    if (signal?.aborted) {
      throw new TaskExecutionError(
        "cancelled",
        "The task was cancelled before it started.",
      );
    }

    const context = AIContextPackageSchema.parse(payload.context);
    if (!executableTaskKind(context.kind)) {
      throw new TaskExecutionError(
        "unknown",
        "This connector cannot execute this task kind.",
      );
    }
    const config = taskConfigFor(context);

    const adapter = this.adapters[payload.provider];
    if (!adapter) {
      throw new TaskExecutionError(
        "provider_unavailable",
        "No managed adapter is available for the requested provider.",
      );
    }

    const input = buildProductAgentInput(context, config.promptVersion);
    const workspace = await this.createWorkspace(
      payload.taskId,
      payload.attemptId,
      {
        context: input,
        // Claude and Codex validate structured output differently, so each gets
        // the schema its own client can actually satisfy.
        responseSchema: config.responseSchema(payload.provider, context),
      },
    );
    this.retain(payload.taskId, payload.attemptId, workspace);

    // The run's own controller is what actually terminates a process group. The
    // external signal and the timeout both feed it, because neither reaches the
    // process runner on its own. A flag distinguishes the two: a timeout is a
    // provider that never finished, a signal is a deliberate cancellation.
    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    signal?.addEventListener("abort", onExternalAbort, { once: true });
    let timedOut = false;
    const timeoutMs =
      this.timeoutOverrideMs ?? config.timeoutMs ?? DEFAULT_TASK_TIMEOUT_MS;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const events = await adapter.run({
        workspace,
        prompt: renderRoomContextPrompt(input),
        systemPrompt: config.systemPrompt,
        manifest: contextManifest(context),
        kind: config.envelopeKind,
        webSearch:
          context.agentKind === "research" &&
          context.researchScope === "web",
        model: payload.model,
        signal: controller.signal,
      });

      let emitted = 0;
      for (const event of events) {
        if (event.type === "completed") {
          let result: TaskResultEnvelope["payload"];
          try {
            result = config.parseResult(event.result, context);
          } catch {
            throw new TaskExecutionError(
              "malformed_output",
              "The managed provider did not return a valid task result.",
            );
          }
          return {
            kind: config.envelopeKind,
            payload: result,
            partial: false,
          };
        }
        if (event.type === "failed") {
          if (event.code === "cancelled" && timedOut && !signal?.aborted) {
            throw new TaskExecutionError(
              "provider_unavailable",
              "The managed provider did not finish within the time limit.",
            );
          }
          throw new TaskExecutionError(event.code, event.message);
        }
        if (emitted >= MAX_TASK_EVENTS) {
          continue;
        }
        const contractEvent = toContractEvent(event);
        if (contractEvent) {
          emit(contractEvent);
          emitted += 1;
        }
      }

      if (timedOut) {
        throw new TaskExecutionError(
          "provider_unavailable",
          "The managed provider did not finish within the time limit.",
        );
      }
      if (controller.signal.aborted) {
        throw new TaskExecutionError(
          "cancelled",
          "The room reply was cancelled.",
        );
      }
      throw new TaskExecutionError(
        "malformed_output",
        "The managed provider produced no room reply.",
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  /** Disposes the workspace once the terminal frame has been acknowledged. */
  async cleanup(taskId: string, attemptId: string): Promise<void> {
    const key = workspaceKey(taskId, attemptId);
    const workspace = this.workspaces.get(key);
    if (!workspace) {
      return;
    }
    this.workspaces.delete(key);
    await workspace.dispose();
  }

  private retain(
    taskId: string,
    attemptId: string,
    workspace: TaskWorkspace,
  ): void {
    this.workspaces.set(workspaceKey(taskId, attemptId), workspace);
    // The device leases at most this many tasks, so more retained workspaces
    // than that means an acknowledgement was missed; the oldest is disposed
    // rather than leaked.
    while (this.workspaces.size > MAX_ACTIVE_TASKS) {
      const oldestKey = this.workspaces.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      const oldest = this.workspaces.get(oldestKey);
      this.workspaces.delete(oldestKey);
      void oldest?.dispose().catch(() => {
        // A workspace that cannot be disposed must not stop the next task.
      });
    }
  }
}

/**
 * Translates one provider event into a bounded contract `TaskEvent`. Labels and
 * deltas are clamped to the contract's own maxima so a long provider label or a
 * large delta can never overflow the wire frame. `completed` and `failed` are
 * terminal and are handled by the caller, so they map to nothing here.
 */
function toContractEvent(event: {
  type: "progress" | "text_delta";
  label?: string;
  percent?: number;
  text?: string;
}): TaskEvent | undefined {
  if (event.type === "progress") {
    const candidate: TaskEvent = {
      type: "progress",
      label: (event.label ?? "").slice(0, 200),
      ...(event.percent === undefined ? {} : { percent: event.percent }),
    };
    const parsed = TaskEventSchema.safeParse(candidate);
    return parsed.success ? parsed.data : undefined;
  }

  const candidate: TaskEvent = {
    type: "text.delta",
    text: (event.text ?? "").slice(0, 10_000),
  };
  const parsed = TaskEventSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}
