import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ManagedFileSystem } from "../config/connector-config";
import { connectorPaths } from "../config/paths";
import { approvalId } from "../engine/build-projection";
import { BuildTaskRunner } from "./build-task";

const fixtures = (name: string) => readFileSync(new URL(`../engine/fixtures/${name}.jsonl`, import.meta.url), "utf8")
  .trim().split("\n").map((line) => JSON.parse(line).frame);
const paths = connectorPaths("/Users/test");
const projectId = "10000000-0000-4000-8000-000000000001";
const selectionId = "10000000-0000-4000-8000-000000000002";
const taskId = "10000000-0000-4000-8000-000000000003";
const sourceMessageId = "10000000-0000-4000-8000-000000000004";
const base = { taskId, attemptId: "attempt", provider: "claude" as const, model: "claude-haiku-4-5" };
const root = "/repo/project";

function harness() {
  const files = new Map([[path.join(paths.engineRoot, "selections", `${selectionId}.json`), JSON.stringify({ root })]]);
  const fileSystem = {
    exists: vi.fn(async (file: string) => files.has(file)),
    readText: vi.fn(async (file: string) => files.get(file)!),
    writePrivateText: vi.fn(async (file: string, value: string) => { files.set(file, value); }),
    rename: vi.fn(async (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); }),
    removeTree: vi.fn(async (file: string) => { files.delete(file); }),
    makeDirectory: vi.fn(),
    copyFile: vi.fn(),
    createSymlink: vi.fn(),
    readSymlink: vi.fn(),
    openPrivateFile: vi.fn(),
  } satisfies ManagedFileSystem;
  const captured = fixtures("build-turn");
  const launch = captured.find((frame) => frame.tag === "orchestration.launchThread")!;
  const launchResponse = captured.find((frame) => frame._tag === "Exit" && frame.requestId === launch.id)!.exit.value;
  const engine = {
    linkFolder: vi.fn(),
    cloneRepo: vi.fn(),
    createRepo: vi.fn(),
    subscribeClones: vi.fn(),
    startBuild: vi.fn(async () => launchResponse),
    continueBuild: vi.fn(),
    async *subscribeThread() { yield* captured.flatMap((frame) => frame.values ?? []); },
    getThreadProjection: vi.fn(),
    answerApproval: vi.fn(),
    interruptBuild: vi.fn(),
  };
  const runner = { run: vi.fn(async (_command: string, args: string[]) => ({
    code: 0, stdout: args.includes("--show-toplevel") ? root : args.includes("for-each-ref") ? "orion/add-a-line" : "main",
  })) };
  return { engine, fileSystem, files, runner, build: new BuildTaskRunner({
    paths, fileSystem, runner, getEngine: async () => engine,
  }) };
}

describe("BuildTaskRunner", () => {
  it("keeps the folder local, runs a supervised build, and reuses the saved run on retry", async () => {
    const { build, engine, files } = harness();
    const linked = await build.execute({ ...base, context: {
      kind: "code_link", projectId, target: { kind: "folder", localSelectionId: selectionId },
    } }, undefined, vi.fn());
    expect(linked).toEqual({ kind: "code_link", partial: false, payload: { engineProjectId: projectId, displayName: "project", repoUrl: null } });
    expect(engine.linkFolder).toHaveBeenCalledWith(expect.objectContaining({ workspaceRoot: root }));
    expect(files.get(path.join(paths.engineRoot, "projects", `${projectId}.json`))).toContain(root);

    const turn = { ...base, context: {
      kind: "build_turn", projectId, engineProjectId: projectId, starTaskId: taskId, sourceMessageId, text: "Add a line",
    } };
    const emit = vi.fn();
    await expect(build.execute(turn, undefined, emit)).resolves.toEqual({ kind: "build_turn", partial: false, payload: { status: "done" } });
    expect(emit).toHaveBeenCalledWith({ type: "build", event: { type: "changed_files", files: [{ path: "README.md", added: 2, removed: 0 }] } });
    expect(engine.startBuild).toHaveBeenCalledWith(expect.objectContaining({ branch: "orion/add-a-line-2", baseRef: "main" }));
    await build.execute(turn, undefined, vi.fn());
    expect(engine.startBuild).toHaveBeenCalledTimes(1);
  });

  it("answers only a pending request with the matching opaque ID", async () => {
    const { build, engine } = harness();
    const requestId = "provider:request:" + "a".repeat(300);
    engine.getThreadProjection.mockResolvedValue({ runtimeRequests: [{ id: requestId, status: "pending" }] });
    const approval = { ...base, context: {
      kind: "build_approval", projectId, starTaskId: taskId, requestId: approvalId(requestId), decision: "decline",
    } };
    await build.execute(approval, undefined, vi.fn());
    expect(engine.answerApproval).toHaveBeenCalledWith({ commandId: taskId, threadId: taskId, requestId, decision: "decline" });
    engine.getThreadProjection.mockResolvedValue({ runtimeRequests: [{ id: requestId, status: "resolved" }] });
    await expect(build.execute(approval, undefined, vi.fn())).rejects.toThrow("no longer pending");
    expect(engine.answerApproval).toHaveBeenCalledTimes(1);
  });
});
