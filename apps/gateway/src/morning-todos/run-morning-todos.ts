import { isMorningWindow, localClock } from "./clock";
import { TodoWriterError, type TodoWriter } from "./deepseek-todo-writer";
import { FactBundleSchema, filterNewTodos, renderFacts, type ProjectFacts } from "./facts";

export const MAX_PROJECTS_PER_RUN = 10;

export type MorningRpcClient = {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type MorningWorkspace = { workspaceId: string; ownerUserId: string; timeZone: string | null };

export type MorningRepository = {
  listWorkspaces(): Promise<MorningWorkspace[]>;
  claim(workspaceId: string, localDate: string): Promise<boolean>;
  facts(workspaceId: string, userId: string, maxProjects: number): Promise<ProjectFacts[]>;
  save(workspaceId: string, projectId: string, summary: string, todos: string[], readUntil: string): Promise<number>;
  finish(workspaceId: string, localDate: string, status: "done" | "failed", projectsRead: number, itemsAdded: number): Promise<void>;
};

export type MorningRunReport = {
  workspaceId: string;
  status: "skipped" | "done" | "failed";
  projectsRead: number;
  itemsAdded: number;
};

type Log = (message: string, details: Record<string, unknown>) => void;

async function call(client: MorningRpcClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn} failed`);
  return data;
}

export function createMorningRepository(client: MorningRpcClient): MorningRepository {
  return {
    async listWorkspaces() {
      const rows = (await call(client, "list_morning_workspaces", {})) as
        { workspace_id: string; owner_user_id: string; time_zone: string | null }[] | null;
      return (rows ?? []).map((row) => ({ workspaceId: row.workspace_id, ownerUserId: row.owner_user_id, timeZone: row.time_zone }));
    },
    async claim(workspaceId, localDate) {
      return (await call(client, "claim_morning_run", { target_workspace_id: workspaceId, target_local_date: localDate })) === true;
    },
    async facts(workspaceId, userId, maxProjects) {
      const rows = (await call(client, "morning_todo_facts", {
        target_workspace_id: workspaceId, target_user_id: userId, max_projects: maxProjects,
      })) as { project_id: string; project_name: string; summary: string; since: string; activity_count: number; facts: unknown }[] | null;
      return (rows ?? []).flatMap((row) => {
        const bundle = FactBundleSchema.safeParse(row.facts);
        if (!bundle.success) return [];
        return [{
          projectId: row.project_id, projectName: row.project_name, summary: row.summary,
          since: row.since, activityCount: row.activity_count, facts: bundle.data,
        }];
      });
    },
    async save(workspaceId, projectId, summary, todos, readUntil) {
      const added = await call(client, "save_morning_todos", {
        target_workspace_id: workspaceId, target_project_id: projectId,
        new_summary: summary, todo_texts: todos, read_until: readUntil,
      });
      return typeof added === "number" ? added : 0;
    },
    async finish(workspaceId, localDate, status, projectsRead, itemsAdded) {
      await call(client, "finish_morning_run", {
        target_workspace_id: workspaceId, target_local_date: localDate,
        run_status: status, read_count: projectsRead, added_count: itemsAdded,
      });
    },
  };
}

export async function runMorningTodos({
  repository,
  writer,
  now,
  force = false,
  log = (message, details) => console.warn(message, details),
}: {
  repository: MorningRepository;
  writer: TodoWriter;
  now: Date;
  force?: boolean;
  log?: Log;
}): Promise<MorningRunReport[]> {
  const reports: MorningRunReport[] = [];
  for (const workspace of await repository.listWorkspaces()) {
    const clock = localClock(now, workspace.timeZone);
    const skipped: MorningRunReport = { workspaceId: workspace.workspaceId, status: "skipped", projectsRead: 0, itemsAdded: 0 };
    if (!force && !isMorningWindow(clock.hour)) { reports.push(skipped); continue; }
    if (!(await repository.claim(workspace.workspaceId, clock.date))) { reports.push(skipped); continue; }

    const readUntil = now.toISOString();
    let projectsRead = 0;
    let itemsAdded = 0;
    let failures = 0;
    let projects: ProjectFacts[] = [];
    try {
      projects = await repository.facts(workspace.workspaceId, workspace.ownerUserId, MAX_PROJECTS_PER_RUN);
    } catch {
      log("morning to-dos: facts failed", { workspaceId: workspace.workspaceId });
      failures += 1;
    }
    for (const project of projects) {
      try {
        const output = await writer.write(renderFacts(project));
        const todos = filterNewTodos(output.todos, project.facts.known_todos);
        itemsAdded += await repository.save(workspace.workspaceId, project.projectId, output.summary, todos, readUntil);
        projectsRead += 1;
      } catch (error) {
        failures += 1;
        log("morning to-dos: project failed", {
          workspaceId: workspace.workspaceId,
          projectId: project.projectId,
          code: error instanceof TodoWriterError ? error.code : "save",
        });
      }
    }
    const status = failures > 0 && projectsRead === 0 ? "failed" : "done";
    await repository.finish(workspace.workspaceId, clock.date, status, projectsRead, itemsAdded);
    reports.push({ workspaceId: workspace.workspaceId, status, projectsRead, itemsAdded });
  }
  return reports;
}
