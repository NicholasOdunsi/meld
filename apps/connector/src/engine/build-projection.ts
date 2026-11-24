import { createHash } from "node:crypto";
import { BUILD_STEP_MIN_INTERVAL_MS, MAX_BUILD_CHANGED_FILES, ChangedFileSchema, type BuildEvent, type BuildStatus, type ChangedFile } from "@meld/contracts";
import { z } from "zod";
import { redactDiagnostic } from "../providers/provider-installer";

const RunSchema = z.object({
  id: z.string(),
  ordinal: z.number().int().positive(),
  status: z.string(),
});
const RuntimeRequestSchema = z.object({ id: z.string(), status: z.string(), kind: z.string() });
const TurnItemSchema = z.object({
  runId: z.string(),
  type: z.string(),
  status: z.string(),
  requestId: z.string().optional(),
  prompt: z.string().nullable().optional(),
});
const MessageSchema = z.object({
  id: z.string(),
  runId: z.string().nullable(),
  role: z.string(),
  text: z.string(),
  streaming: z.boolean(),
});
const ThreadSchema = z.object({ branch: z.string().nullable() });
const CheckpointSchema = z.object({
  runId: z.string().nullable(),
  files: z.array(z.object({
    path: z.string(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  })),
});
const SnapshotSchema = z.object({
  kind: z.literal("snapshot"),
  snapshotSequence: z.number().int().nonnegative(),
  projection: z.object({
    thread: ThreadSchema,
    runs: z.array(RunSchema),
    runtimeRequests: z.array(RuntimeRequestSchema),
    turnItems: z.array(z.unknown()),
    messages: z.array(z.unknown()),
    checkpoints: z.array(z.unknown()).default([]),
  }),
});
const EventSchema = z.object({
  kind: z.literal("event"),
  sequence: z.number().int().nonnegative(),
  event: z.object({ type: z.string(), payload: z.unknown() }),
});

const TERMINAL = new Map<string, Extract<BuildStatus, "done" | "failed" | "cancelled">>([
  ["completed", "done"], ["failed", "failed"], ["cancelled", "cancelled"],
  ["interrupted", "cancelled"], ["rolled_back", "cancelled"],
]);

const STEPS = new Map([
  ["reasoning", "Working on your request"],
  ["command_execution", "Running a command"],
  ["file_change", "Editing files"],
  ["checkpoint", "Saving changes"],
]);

type RuntimeRequest = z.infer<typeof RuntimeRequestSchema>;
type TurnItem = z.infer<typeof TurnItemSchema>;

/** T3 request identifiers can exceed the cloud contract's size limit. */
export function approvalId(engineRequestId: string): string {
  return createHash("sha256").update(engineRequestId).digest("hex");
}

/** Materializes one run's resumable stream. A snapshot replaces prior local state. */
export class BuildProjection {
  sequence = -1;
  terminal: { status: "done" | "failed" | "cancelled"; ordinal: number } | undefined;
  changedFiles: ChangedFile[] = [];
  private readonly requests = new Map<string, RuntimeRequest>();
  private readonly approvalItems = new Map<string, TurnItem>();
  private readonly replies = new Map<string, string>();
  private lastApproval: string | undefined;
  private branch: string | undefined;
  private lastStepAt = -Infinity;

  constructor(
    private readonly runId: string,
    private readonly now: () => number = Date.now,
    private readonly localPaths: readonly string[] = [],
  ) {}

  get reply(): string {
    return [...this.replies.values()].join("\n\n").slice(0, 100_000);
  }

  read(packet: unknown): BuildEvent[] {
    const snapshot = SnapshotSchema.safeParse(packet);
    if (snapshot.success) {
      if (snapshot.data.snapshotSequence < this.sequence) return [];
      this.sequence = snapshot.data.snapshotSequence;
      const { projection } = snapshot.data;
      const events = this.readBranch(projection.thread.branch);
      this.requests.clear();
      this.approvalItems.clear();
      this.replies.clear();
      for (const request of projection.runtimeRequests) this.requests.set(request.id, request);
      for (const value of projection.turnItems) {
        const item = TurnItemSchema.safeParse(value);
        if (item.success) this.rememberApprovalItem(item.data);
      }
      for (const message of projection.messages) this.readMessage(message);
      for (const checkpoint of projection.checkpoints) this.readCheckpoint(checkpoint);
      const run = projection.runs.find(({ id }) => id === this.runId);
      if (run) this.readRun(run);
      return [...events, ...this.publishApproval()];
    }

    const update = EventSchema.safeParse(packet);
    if (!update.success || update.data.sequence <= this.sequence) return [];
    this.sequence = update.data.sequence;
    const { type, payload } = update.data.event;
    switch (type) {
      case "thread.updated": {
        const thread = ThreadSchema.safeParse(payload);
        return thread.success ? this.readBranch(thread.data.branch) : [];
      }
      case "run.created":
      case "run.updated": {
        const run = RunSchema.safeParse(payload);
        if (run.success && run.data.id === this.runId) this.readRun(run.data);
        return [];
      }
      case "message.updated":
        this.readMessage(payload);
        return [];
      case "checkpoint.captured":
        this.readCheckpoint(payload);
        return [];
      case "runtime-request.updated": {
        const request = RuntimeRequestSchema.safeParse(payload);
        if (request.success) this.requests.set(request.data.id, request.data);
        return this.publishApproval();
      }
      case "turn-item.updated": {
        const item = TurnItemSchema.safeParse(payload);
        if (!item.success || item.data.runId !== this.runId) return [];
        this.rememberApprovalItem(item.data);
        return item.data.type === "approval_request" ? this.publishApproval() : this.readStep(item.data);
      }
      default:
        return [];
    }
  }

  private readRun(run: z.infer<typeof RunSchema>): void {
    const status = TERMINAL.get(run.status);
    if (status) this.terminal = { status, ordinal: run.ordinal };
  }

  private readBranch(branch: string | null): BuildEvent[] {
    if (!branch || branch === this.branch || branch.length > 250) return [];
    this.branch = branch;
    return [{ type: "branch", name: branch }];
  }

  private readMessage(value: unknown): void {
    const message = MessageSchema.safeParse(value);
    if (message.success && message.data.runId === this.runId
      && message.data.role === "assistant" && !message.data.streaming) {
      this.replies.set(message.data.id, this.redactLocalDetails(message.data.text.trim()));
    }
  }

  private readCheckpoint(value: unknown): void {
    const checkpoint = CheckpointSchema.safeParse(value);
    if (!checkpoint.success || checkpoint.data.runId !== this.runId) return;
    this.changedFiles = checkpoint.data.files.slice(0, MAX_BUILD_CHANGED_FILES).flatMap((file) => {
      const parsed = ChangedFileSchema.safeParse({ path: file.path, added: file.additions, removed: file.deletions });
      return parsed.success && !file.path.startsWith("/") && !file.path.split("/").includes("..") ? [parsed.data] : [];
    });
  }

  private rememberApprovalItem(item: TurnItem): void {
    if (item.runId === this.runId && item.type === "approval_request" && item.requestId) {
      this.approvalItems.set(item.requestId, item);
    }
  }

  private publishApproval(): BuildEvent[] {
    const next = [...this.approvalItems].find(([id]) => this.requests.get(id)?.status === "pending");
    const id = next ? approvalId(next[0]) : undefined;
    if (id === this.lastApproval) return [];
    this.lastApproval = id;
    if (!id || !next) return [{ type: "status", status: "working" }];
    const kind = this.requests.get(next[0])?.kind;
    const prompt = next[1].prompt && this.redactLocalDetails(next[1].prompt).trim().slice(0, 500);
    return [{
      type: "approval_request",
      request: {
        id,
        summary: prompt || (kind === "command" ? "Run a command in the build worktree" : "Allow the build to make changes"),
        choices: [{ id: "accept", label: "Approve" }, { id: "decline", label: "Decline" }],
      },
    }, { type: "status", status: "needs_you" }];
  }

  private redactLocalDetails(text: string): string {
    for (const localPath of this.localPaths) {
      text = text.replaceAll(localPath, "[local path]").replaceAll(encodeURI(localPath), "[local path]");
    }
    return redactDiagnostic(text.replace(/(^|[\s='"(])\/[\w./@~+-]+/g, "$1[local path]"));
  }

  private readStep(item: TurnItem): BuildEvent[] {
    const label = STEPS.get(item.type);
    const now = this.now();
    if (!label || this.terminal || now - this.lastStepAt < BUILD_STEP_MIN_INTERVAL_MS) return [];
    this.lastStepAt = now;
    return [{ type: "step", label }];
  }
}
