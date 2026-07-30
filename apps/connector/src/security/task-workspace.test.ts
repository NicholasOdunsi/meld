import {
  lstat,
  lutimes,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { connectorPaths, type ConnectorPaths } from "../config/paths";
import {
  ABANDONED_WORKSPACE_MAX_AGE_MS,
  createTaskWorkspace,
  removeAbandonedWorkspaces,
  TASK_WORKSPACE_MODE,
  TaskWorkspaceError,
} from "./task-workspace";

const TASK_ID = "66666666-6666-4666-8666-666666666666";
const ATTEMPT_ID = "77777777-7777-4777-8777-777777777777";

const CONTENTS = {
  context: { taskId: TASK_ID, messages: [] },
  responseSchema: { type: "object" },
};

const homes: string[] = [];

async function managedHome(): Promise<ConnectorPaths> {
  const home = await mkdtemp(path.join(tmpdir(), "meld-task-workspace-"));
  homes.push(home);
  return connectorPaths(home);
}

async function mode(target: string): Promise<number> {
  return (await stat(target)).mode & 0o777;
}

async function ageEntry(target: string, ageMs: number): Promise<void> {
  const when = (Date.now() - ageMs) / 1_000;
  await lutimes(target, when, when);
}

afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
  );
});

describe("task workspace", () => {
  it("creates an owner-only directory holding only the three managed files", async () => {
    const paths = await managedHome();

    const workspace = await createTaskWorkspace(
      paths,
      TASK_ID,
      ATTEMPT_ID,
      CONTENTS,
    );

    expect(path.dirname(workspace.directory)).toBe(paths.tasksRoot);
    expect(await mode(workspace.directory)).toBe(TASK_WORKSPACE_MODE);
    expect((await readdir(workspace.directory)).sort()).toEqual([
      "context.json",
      "mcp.json",
      "response-schema.json",
    ]);
    for (const file of [
      workspace.contextFile,
      workspace.responseSchemaFile,
      workspace.mcpConfigFile,
    ]) {
      expect(await mode(file)).toBe(0o600);
      expect(path.dirname(file)).toBe(workspace.directory);
    }
  });

  it("writes the context, the response schema, and an empty MCP configuration", async () => {
    const paths = await managedHome();

    const workspace = await createTaskWorkspace(
      paths,
      TASK_ID,
      ATTEMPT_ID,
      CONTENTS,
    );

    expect(
      JSON.parse(await readFile(workspace.contextFile, "utf8")),
    ).toEqual(CONTENTS.context);
    expect(
      JSON.parse(await readFile(workspace.responseSchemaFile, "utf8")),
    ).toEqual(CONTENTS.responseSchema);
    expect(
      JSON.parse(await readFile(workspace.mcpConfigFile, "utf8")),
    ).toEqual({ mcpServers: {} });
  });

  it("is not a git repository", async () => {
    const paths = await managedHome();

    const workspace = await createTaskWorkspace(
      paths,
      TASK_ID,
      ATTEMPT_ID,
      CONTENTS,
    );

    await expect(stat(path.join(workspace.directory, ".git"))).rejects.toThrow();
  });

  it("refuses identifiers that could escape the managed task root", async () => {
    const paths = await managedHome();

    for (const unsafe of [
      "..",
      "../../etc",
      "nested/task",
      `${path.sep}absolute`,
      "",
      "task id",
      ".",
    ]) {
      await expect(
        createTaskWorkspace(paths, unsafe, ATTEMPT_ID, CONTENTS),
      ).rejects.toBeInstanceOf(TaskWorkspaceError);
      await expect(
        createTaskWorkspace(paths, TASK_ID, unsafe, CONTENTS),
      ).rejects.toBeInstanceOf(TaskWorkspaceError);
    }

    // Nothing was created on the way to any of those refusals.
    await expect(readdir(paths.tasksRoot).catch(() => [])).resolves.toEqual([]);
  });

  it("removes the whole directory when the task is disposed", async () => {
    const paths = await managedHome();
    const workspace = await createTaskWorkspace(
      paths,
      TASK_ID,
      ATTEMPT_ID,
      CONTENTS,
    );

    await workspace.dispose();
    await workspace.dispose();

    expect(await readdir(paths.tasksRoot)).toEqual([]);
  });

  it("removes only direct children older than a day on startup", async () => {
    const paths = await managedHome();
    await mkdir(paths.tasksRoot, { recursive: true });
    const stale = path.join(paths.tasksRoot, "stale");
    const fresh = path.join(paths.tasksRoot, "fresh");
    await mkdir(stale);
    await mkdir(fresh);
    const nested = path.join(fresh, "old-file.json");
    await writeFile(nested, "{}");
    await ageEntry(nested, ABANDONED_WORKSPACE_MAX_AGE_MS * 3);
    await ageEntry(stale, ABANDONED_WORKSPACE_MAX_AGE_MS + 60_000);

    await removeAbandonedWorkspaces(paths);

    expect(await readdir(paths.tasksRoot)).toEqual(["fresh"]);
    expect(await readdir(fresh)).toEqual(["old-file.json"]);
  });

  it("unlinks a stale symlink without following it", async () => {
    const paths = await managedHome();
    await mkdir(paths.tasksRoot, { recursive: true });
    const outside = path.join(path.dirname(paths.root), "outside");
    const treasure = path.join(outside, "keep.txt");
    await mkdir(outside, { recursive: true });
    await writeFile(treasure, "keep");
    const link = path.join(paths.tasksRoot, "linked");
    await symlink(outside, link);
    await ageEntry(link, ABANDONED_WORKSPACE_MAX_AGE_MS + 60_000);

    await removeAbandonedWorkspaces(paths);

    expect(await readdir(paths.tasksRoot)).toEqual([]);
    expect(await readFile(treasure, "utf8")).toBe("keep");
    await expect(stat(outside)).resolves.toBeDefined();
  });

  it("judges a symlink by the link itself, never by its target", async () => {
    const paths = await managedHome();
    await mkdir(paths.tasksRoot, { recursive: true });
    const outside = path.join(path.dirname(paths.root), "fresh-target");
    await mkdir(outside, { recursive: true });
    const link = path.join(paths.tasksRoot, "linked");
    await symlink(outside, link);
    await ageEntry(link, ABANDONED_WORKSPACE_MAX_AGE_MS + 60_000);

    // The target's own timestamp is current; only an `lstat` sees the stale link.
    expect((await stat(outside)).mtimeMs).toBeGreaterThan(
      (await lstat(link)).mtimeMs,
    );

    await removeAbandonedWorkspaces(paths);

    expect(await readdir(paths.tasksRoot)).toEqual([]);
    await expect(stat(outside)).resolves.toBeDefined();
  });

  it("does nothing when no task has ever run", async () => {
    const paths = await managedHome();

    await expect(removeAbandonedWorkspaces(paths)).resolves.toEqual([]);
  });
});
