import { chmod, lstat, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConnectorPaths } from "../config/paths";

/** Owner-only: nothing else on the Mac may read a room's context. */
export const TASK_WORKSPACE_MODE = 0o700;

/** Owner-only for the three files Meld writes into a workspace. */
export const TASK_FILE_MODE = 0o600;

/** How long a workspace left behind by a crash is kept before the sweep. */
export const ABANDONED_WORKSPACE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

/** The MCP configuration every provider child is pointed at: no servers, ever. */
export const EMPTY_MCP_CONFIG = { mcpServers: {} } as const;

/**
 * Identifiers that may become one path segment. Deliberately narrower than "no
 * separators": anything outside this set — a dot, a space, a NUL, a separator,
 * an absolute path — is refused rather than sanitised, so there is no escaping
 * form left to reason about.
 */
const SAFE_IDENTIFIER = /^[0-9A-Za-z][0-9A-Za-z-]{0,63}$/;

export type TaskWorkspaceFailure = "unsafe-identifier";

export class TaskWorkspaceError extends Error {
  override readonly name = "TaskWorkspaceError";
  readonly reason: TaskWorkspaceFailure;

  constructor(reason: TaskWorkspaceFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

/** What Meld writes into a workspace, and nothing else. */
export interface TaskWorkspaceContents {
  context: unknown;
  responseSchema: unknown;
}

export interface TaskWorkspace {
  readonly directory: string;
  readonly contextFile: string;
  readonly responseSchemaFile: string;
  readonly mcpConfigFile: string;
  dispose(): Promise<void>;
}

/** One direct child of the tasks root, described without following symlinks. */
export interface TaskRootEntry {
  name: string;
  modifiedAtMs: number;
  isSymbolicLink: boolean;
}

/**
 * The file-system operations a workspace needs, as an injected seam so tests
 * never have to write into a real managed directory.
 */
export interface TaskWorkspaceFileSystem {
  makePrivateDirectory(directory: string, mode: number): Promise<void>;
  writePrivateText(file: string, contents: string, mode: number): Promise<void>;
  /** Removes a file, a directory tree, or a symlink — never a symlink's target. */
  remove(target: string): Promise<void>;
  /** `lstat`-based listing: a symlink is reported, never traversed. */
  listEntries(directory: string): Promise<readonly TaskRootEntry[]>;
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && error.code === "ENOENT"
  );
}

export const nodeTaskWorkspaceFileSystem: TaskWorkspaceFileSystem = {
  async makePrivateDirectory(directory, mode) {
    await mkdir(directory, { recursive: true, mode });
    // `mkdir` applies the mode through the umask and only on creation, so the
    // owner-only bits are re-asserted rather than assumed.
    await chmod(directory, mode);
  },
  async writePrivateText(file, contents, mode) {
    await writeFile(file, contents, { encoding: "utf8", mode });
    await chmod(file, mode);
  },
  async remove(target) {
    // `rm` on a symlink unlinks the link itself; it does not descend into the
    // directory the link points at.
    await rm(target, { recursive: true, force: true });
  },
  async listEntries(directory) {
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if (isMissing(error)) {
        return [];
      }
      throw error;
    }

    const entries: TaskRootEntry[] = [];
    for (const name of names) {
      try {
        const stats = await lstat(path.join(directory, name));
        entries.push({
          name,
          modifiedAtMs: stats.mtimeMs,
          isSymbolicLink: stats.isSymbolicLink(),
        });
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
      }
    }
    return entries;
  },
};

function assertSafeIdentifier(value: string, label: string): string {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new TaskWorkspaceError(
      "unsafe-identifier",
      `Refusing to build a task workspace from an unsafe ${label}.`,
    );
  }
  return value;
}

/**
 * Creates the per-task workspace: one mode-`0700` directory directly under the
 * managed tasks root holding exactly three owner-only files — the room context,
 * the response schema, and an MCP configuration with no servers in it.
 *
 * It is deliberately not a git repository and contains no source, so a provider
 * that ignored its sandbox would still find nothing but the data it was given.
 * That is also why the Codex invocation must pass `--skip-git-repo-check`.
 */
export async function createTaskWorkspace(
  paths: ConnectorPaths,
  taskId: string,
  attemptId: string,
  contents: TaskWorkspaceContents,
  fileSystem: TaskWorkspaceFileSystem = nodeTaskWorkspaceFileSystem,
): Promise<TaskWorkspace> {
  const name = `${assertSafeIdentifier(taskId, "task identifier")}-${
    assertSafeIdentifier(attemptId, "attempt identifier")
  }`;
  const root = path.resolve(paths.tasksRoot);
  const directory = path.resolve(root, name);

  if (path.dirname(directory) !== root) {
    throw new TaskWorkspaceError(
      "unsafe-identifier",
      "Refusing to build a task workspace outside Meld's task root.",
    );
  }

  const workspace: TaskWorkspace = {
    directory,
    contextFile: path.join(directory, "context.json"),
    responseSchemaFile: path.join(directory, "response-schema.json"),
    mcpConfigFile: path.join(directory, "mcp.json"),
    async dispose() {
      await fileSystem.remove(directory);
    },
  };

  await fileSystem.makePrivateDirectory(root, TASK_WORKSPACE_MODE);
  // A leftover directory from an earlier attempt with the same identifiers must
  // not contribute a single file to this run.
  await fileSystem.remove(directory);
  await fileSystem.makePrivateDirectory(directory, TASK_WORKSPACE_MODE);

  try {
    await fileSystem.writePrivateText(
      workspace.contextFile,
      `${JSON.stringify(contents.context)}\n`,
      TASK_FILE_MODE,
    );
    await fileSystem.writePrivateText(
      workspace.responseSchemaFile,
      `${JSON.stringify(contents.responseSchema)}\n`,
      TASK_FILE_MODE,
    );
    await fileSystem.writePrivateText(
      workspace.mcpConfigFile,
      `${JSON.stringify(EMPTY_MCP_CONFIG)}\n`,
      TASK_FILE_MODE,
    );
  } catch (error) {
    await workspace.dispose();
    throw error;
  }

  return workspace;
}

export interface AbandonedWorkspaceSweepOptions {
  now?: number;
  maxAgeMs?: number;
  fileSystem?: TaskWorkspaceFileSystem;
}

/**
 * Removes workspaces a previous run left behind. Only direct children of the
 * tasks root are considered, and each is judged by an `lstat` of the entry
 * itself: a symlink is unlinked without ever being followed, so neither its age
 * nor its contents can be borrowed from somewhere else on the disk. Meld never
 * creates one, so any symlink here is unexpected by definition.
 */
export async function removeAbandonedWorkspaces(
  paths: ConnectorPaths,
  options: AbandonedWorkspaceSweepOptions = {},
): Promise<readonly string[]> {
  const fileSystem = options.fileSystem ?? nodeTaskWorkspaceFileSystem;
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? ABANDONED_WORKSPACE_MAX_AGE_MS;
  const root = path.resolve(paths.tasksRoot);
  const removed: string[] = [];

  for (const entry of await fileSystem.listEntries(root)) {
    if (!entry.isSymbolicLink && now - entry.modifiedAtMs < maxAgeMs) {
      continue;
    }

    const target = path.join(root, entry.name);
    try {
      await fileSystem.remove(target);
      removed.push(target);
    } catch {
      // A workspace that cannot be removed must not stop the connector from
      // starting; the next sweep will try again.
    }
  }

  return removed;
}
