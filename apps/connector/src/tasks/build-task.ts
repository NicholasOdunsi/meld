import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { BuildTaskContextSchema, type BuildEvent, type BuildTaskContext, type BuildTaskResult } from "@meld/contracts";
import { z } from "zod";
import type { ManagedFileSystem } from "../config/connector-config";
import type { ConnectorPaths } from "../config/paths";
import { approvalId, BuildProjection } from "../engine/build-projection";
import type { EngineClient } from "../engine/engine-client";
import type { CommandRunner } from "../launchd/command-runner";
import { RELEASES } from "../providers/release-manifest";
import type { TaskEmit, TaskPayload } from "../transport/gateway-client";

const LocalProjectSchema = z.object({ root: z.string().refine(path.isAbsolute), baseRef: z.string().min(1) });
const LocalTurnSchema = z.object({ branch: z.string(), runId: z.string().optional() });
const RunSchema = z.object({ id: z.string(), userMessageId: z.string().nullish() });
const RuntimeRequestSchema = z.object({ id: z.string(), status: z.string() });

type LocalProject = z.infer<typeof LocalProjectSchema>;
type LocalTurn = z.infer<typeof LocalTurnSchema>;
type TurnContext = Extract<BuildTaskContext, { kind: "build_turn" }>;
type RunningTurn = { threadId: string; runId?: string; dispatching?: Promise<unknown> };
type Engine = Pick<EngineClient, "linkFolder" | "cloneRepo" | "createRepo" | "startBuild" | "continueBuild"
  | "subscribeThread" | "getThreadProjection" | "subscribeClones" | "answerApproval" | "interruptBuild">;

function commandId(key: string): string {
  const id = createHash("sha256").update(key).digest("hex");
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-4${id.slice(13, 16)}-8${id.slice(17, 20)}-${id.slice(20, 32)}`;
}

export class BuildTaskRunner {
  private readonly running = new Map<string, RunningTurn>();
  private readonly reservedBranches = new Map<string, Set<string>>();

  constructor(private readonly deps: {
    paths: ConnectorPaths;
    fileSystem: ManagedFileSystem;
    runner: CommandRunner;
    getEngine(): Promise<Engine>;
  }) {}

  async execute(payload: TaskPayload, signal: AbortSignal | undefined, emit: TaskEmit): Promise<BuildTaskResult> {
    const context = BuildTaskContextSchema.parse(payload.context);
    if (payload.provider !== "claude" && payload.provider !== "codex") throw new Error("Select Claude or Codex for this build.");
    signal?.throwIfAborted();
    const engine = await this.deps.getEngine();
    signal?.throwIfAborted();
    if (context.kind === "code_link") {
      const linked = await this.link(engine, payload.taskId, context, signal);
      return { kind: "code_link", partial: false, payload: linked };
    }
    if (context.kind === "build_approval") {
      const projection = await engine.getThreadProjection(context.starTaskId);
      const { runtimeRequests } = z.object({ runtimeRequests: z.array(RuntimeRequestSchema) }).parse(projection);
      const request = runtimeRequests.find((item) => item.status === "pending" && approvalId(item.id) === context.requestId);
      if (!request) throw new Error("This build approval is no longer pending.");
      signal?.throwIfAborted();
      await engine.answerApproval({
        commandId: payload.taskId, threadId: context.starTaskId, requestId: request.id, decision: context.decision,
      });
      return { kind: "build_approval", partial: false, payload: { requestId: context.requestId } };
    }
    const provider = payload.provider;
    const status = await this.turn(engine, context, payload.taskId,
      { instanceId: provider === "claude" ? "claudeAgent" : "codex", model: payload.model ?? RELEASES.providers[provider].defaultModel },
      signal, (event) => emit({ type: "build", event }));
    return { kind: "build_turn", partial: false, payload: { status } };
  }

  async cancel(taskId: string): Promise<void> {
    const turn = this.running.get(taskId);
    if (!turn) return;
    const engine = await this.deps.getEngine();
    await turn.dispatching?.catch(() => {});
    const runId = turn.runId ?? await this.findRun(engine, turn.threadId, taskId);
    if (runId) await engine.interruptBuild({ commandId: commandId(`${taskId}:cancel`), threadId: turn.threadId, runId });
  }

  private async link(engine: Engine, taskId: string, context: Extract<BuildTaskContext, { kind: "code_link" }>, signal?: AbortSignal) {
    const { target, projectId } = context;
    const projects = path.join(this.deps.paths.engineRoot, "projects");
    const location = path.join(projects, `${projectId}.json`);
    const previous = await this.read(location, LocalProjectSchema);
    let root: string;
    let repoUrl: string | null = null;
    let cloneRegistered = false;
    if (target.kind === "folder") {
      const selection = path.join(this.deps.paths.engineRoot, "selections", `${target.localSelectionId}.json`);
      const folder = await this.read(selection, z.object({ root: z.string().refine(path.isAbsolute) }));
      if (!folder) throw new Error("Select the folder again on this Mac.");
      root = await this.git(folder.root, ["rev-parse", "--show-toplevel"], signal);
    } else {
      root = path.join(this.deps.paths.engineRoot, "repositories", projectId);
      if (target.kind === "github") {
        repoUrl = `https://github.com/${target.repository}`;
        cloneRegistered = true;
        if (!previous && !await this.deps.fileSystem.exists(path.join(root, ".git"))) {
          await this.deps.fileSystem.makeDirectory(path.dirname(root));
          await engine.cloneRepo({
            projectId, title: target.repository, createdAt: new Date().toISOString(), repository: target.repository, destinationPath: root,
          });
          await this.waitForClone(engine, projectId, signal);
        } else {
          const origin = await this.git(root, ["remote", "get-url", "origin"], signal);
          if (this.githubUrl(origin).toLowerCase() !== repoUrl.toLowerCase()) {
            throw new Error("The existing checkout belongs to a different GitHub repository.");
          }
        }
      } else {
        if (!previous) {
          await this.deps.fileSystem.makeDirectory(root);
          await this.git(root, ["init", "--initial-branch=main"], signal);
          if (!await this.deps.fileSystem.exists(path.join(root, ".git", "refs", "heads", "main"))) {
            await this.git(root, ["-c", "user.name=Orion", "-c", "user.email=orion@localhost",
              "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "Initialize project"], signal);
          }
        }
        const origin = await this.deps.runner.run("/usr/bin/git", ["-C", root, "remote", "get-url", "origin"], { signal });
        const published = origin.code === 0
          ? { remoteUrl: origin.stdout.trim() }
          : z.object({ remoteUrl: z.string() }).parse(await engine.createRepo({ cwd: root, repository: target.repository }));
        repoUrl = this.githubUrl(published.remoteUrl);
        if (repoUrl.split("/").at(-1)?.toLowerCase() !== target.repository.toLowerCase()) {
          throw new Error("The starter repository already has a different GitHub remote.");
        }
      }
    }
    if (previous && previous.root !== root) throw new Error("This project has a different local repository.");
    const project = previous ?? { root, baseRef: await this.git(root, ["rev-parse", "--abbrev-ref", "HEAD"], signal) };
    signal?.throwIfAborted();
    const displayName = repoUrl?.slice("https://github.com/".length) ?? path.basename(root);
    if (!cloneRegistered && !previous) {
      await engine.linkFolder({ commandId: taskId, projectId, title: displayName, workspaceRoot: root });
    }
    await this.write(location, project);
    return { engineProjectId: projectId, displayName: displayName.slice(0, 200), repoUrl };
  }

  private githubUrl(remote: string): string {
    const url = remote.replace(/^git@github\.com:/, "https://github.com/").replace(/\.git$/, "");
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)) throw new Error("GitHub did not return a repository link.");
    return url;
  }

  private async waitForClone(engine: Engine, projectId: string, signal?: AbortSignal): Promise<void> {
    const deadline = AbortSignal.timeout(10 * 60_000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    const progress = z.array(z.object({ projectId: z.string(), phase: z.string() }));
    for await (const update of engine.subscribeClones(combined)) {
      const clone = progress.parse(update).find((entry) => entry.projectId === projectId);
      if (clone?.phase === "done") return;
      if (clone?.phase === "failed" || clone?.phase === "cancelled") throw new Error("Could not clone this GitHub repository.");
    }
    throw new Error("Could not confirm the GitHub clone.");
  }

  private async turn(
    engine: Engine, context: TurnContext, taskId: string,
    modelSelection: Parameters<EngineClient["startBuild"]>[0]["modelSelection"],
    signal: AbortSignal | undefined, emit: (event: BuildEvent) => void,
  ): Promise<"done" | "failed" | "cancelled"> {
    const { starTaskId: threadId } = context;
    const stateFile = path.join(this.deps.paths.engineRoot, "turns", `${taskId}.json`);
    const project = await this.read(path.join(this.deps.paths.engineRoot, "projects", `${context.projectId}.json`), LocalProjectSchema);
    if (!project) throw new Error("The linked code is unavailable on this Mac.");
    const running: RunningTurn = { threadId };
    this.running.set(taskId, running);
    try {
      let state = await this.read(stateFile, LocalTurnSchema);
      const title = context.text.trim().split("\n", 1)[0]!.slice(0, 120);
      if (!state) {
        state = { branch: threadId === taskId ? await this.chooseBranch(project.root, title, signal) : "" };
        await this.write(stateFile, state);
      }
      signal?.throwIfAborted();
      let runId = state.runId;
      if (!runId) {
        if (threadId === taskId) {
          running.dispatching = engine.startBuild({
            commandId: taskId, threadId, projectId: context.engineProjectId, title,
            branch: state.branch, baseRef: project.baseRef, modelSelection, prompt: context.text,
          });
          const output = z.object({ projection: z.object({ runs: z.array(RunSchema) }) }).parse(await running.dispatching);
          runId = output.projection.runs.find((run) => run.userMessageId === taskId)?.id ?? output.projection.runs[0]?.id;
        } else {
          runId = await this.findRun(engine, threadId, taskId);
          if (!runId) {
            signal?.throwIfAborted();
            running.dispatching = engine.continueBuild({ commandId: taskId, threadId, messageId: taskId, text: context.text });
            await running.dispatching;
          }
        }
      }
      const localPaths = [this.deps.paths.engineRoot, project.root, this.deps.paths.userHome];
      let projection = runId ? new BuildProjection(runId, Date.now, localPaths) : undefined;
      running.runId = runId;
      if (runId) await this.write(stateFile, { ...state, runId });
      emit({ type: "status", status: "working" });

      for (let reconnect = 0; reconnect <= 3; reconnect++) {
        try {
          for await (const item of engine.subscribeThread(threadId, undefined, signal)) {
            if (!projection) {
              const found = this.runInPacket(item, taskId);
              if (!found) continue;
              running.runId = found;
              projection = new BuildProjection(found, Date.now, localPaths);
              await this.write(stateFile, { ...state, runId: found });
            }
            for (const event of projection.read(item)) emit(event);
            if (projection.terminal) {
              if (projection.terminal.status === "done" && projection.worktreePath) {
                const preview = path.join(this.deps.paths.engineRoot, "previews", `${threadId}.json`);
                await this.write(preview, { worktree: projection.worktreePath }).catch(() => {});
              }
              if (projection.reply) emit({ type: "reply", text: projection.reply });
              emit({ type: "changed_files", files: projection.changedFiles });
              return projection.terminal.status;
            }
          }
        } catch {
          signal?.throwIfAborted();
        }
        if (reconnect < 3) {
          emit({ type: "engine_offline" });
          await sleep(Math.min(1_000 * 2 ** reconnect, 5_000), undefined, { signal });
        }
      }
      throw new Error("The build engine connection was lost.");
    } finally {
      this.running.delete(taskId);
    }
  }

  private async chooseBranch(root: string, title: string, signal?: AbortSignal): Promise<string> {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "build";
    const prefix = `orion/${slug}`;
    const refs = new Set((await this.git(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads"], signal)).split("\n"));
    let reserved = this.reservedBranches.get(root);
    if (!reserved) this.reservedBranches.set(root, reserved = new Set());
    let branch = prefix;
    for (let index = 2; refs.has(branch) || reserved.has(branch); index++) branch = `${prefix}-${index}`;
    reserved.add(branch);
    return branch;
  }

  private async findRun(engine: Engine, threadId: string, taskId: string): Promise<string | undefined> {
    const projection = z.object({ runs: z.array(RunSchema) }).parse(await engine.getThreadProjection(threadId));
    return projection.runs.find((run) => run.userMessageId === taskId)?.id;
  }

  private runInPacket(packet: unknown, taskId: string): string | undefined {
    const parsed = z.union([
      z.object({ kind: z.literal("snapshot"), projection: z.object({ runs: z.array(RunSchema) }) }),
      z.object({ kind: z.literal("event"), event: z.object({ type: z.enum(["run.created", "run.updated"]), payload: RunSchema }) }),
    ]).safeParse(packet);
    if (!parsed.success) return undefined;
    const runs = parsed.data.kind === "snapshot" ? parsed.data.projection.runs : [parsed.data.event.payload];
    return runs.find((run) => run.userMessageId === taskId)?.id;
  }

  private async git(root: string, args: string[], signal?: AbortSignal): Promise<string> {
    const result = await this.deps.runner.run("/usr/bin/git", ["-C", root, "-c", "core.hooksPath=/dev/null", ...args], { signal });
    if (result.code !== 0) throw new Error("The linked Git repository could not be prepared.");
    return result.stdout.trim();
  }

  private async read<T>(file: string, schema: z.ZodType<T>): Promise<T | undefined> {
    if (!await this.deps.fileSystem.exists(file)) return undefined;
    return schema.parse(JSON.parse(await this.deps.fileSystem.readText(file)));
  }

  private async write(file: string, value: LocalProject | LocalTurn | { worktree: string }): Promise<void> {
    const { fileSystem } = this.deps;
    const temporary = `${file}.${randomUUID()}.tmp`;
    await fileSystem.makeDirectory(path.dirname(file));
    try {
      await fileSystem.writePrivateText(temporary, JSON.stringify(value));
      await fileSystem.rename(temporary, file);
    } finally {
      await fileSystem.removeTree(temporary).catch(() => {});
    }
  }
}
