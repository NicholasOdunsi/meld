import { TodoItemSchema, type TodoItem, type TodoStage } from "@meld/contracts";

export type TodoRpcClient = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

const READ_ERROR = "We could not load your to-dos.";
const WRITE_ERROR = "We could not update your to-dos. Try again.";

type Row = { id: string; project_id: string | null; text: string; stage: string; position: number; created_at: string };

export async function readTodos(client: TodoRpcClient, workspaceId: string): Promise<TodoItem[]> {
  const { data, error } = await client.rpc("list_todo_items", { target_workspace_id: workspaceId });
  if (error) throw new Error(READ_ERROR);
  return ((Array.isArray(data) ? data : []) as Row[]).flatMap((row) => {
    const parsed = TodoItemSchema.safeParse({
      id: row.id, projectId: row.project_id, text: row.text, stage: row.stage,
      position: row.position, createdAt: row.created_at,
    });
    return parsed.success ? [parsed.data] : [];
  });
}

async function write(client: TodoRpcClient, fn: string, args: Record<string, unknown>) {
  const { error } = await client.rpc(fn, args);
  if (error) throw new Error(WRITE_ERROR);
}

export function writeTodo(
  client: TodoRpcClient,
  input: { workspaceId: string; id: string; text: string; projectId: string | null; position: number },
) {
  return write(client, "save_todo_item", {
    target_workspace_id: input.workspaceId, item_id: input.id, item_text: input.text,
    item_project_id: input.projectId, item_position: input.position,
  });
}

export function moveTodos(client: TodoRpcClient, input: { workspaceId: string; ids: string[]; stage: TodoStage }) {
  return write(client, "set_todo_stage", {
    target_workspace_id: input.workspaceId, item_ids: input.ids, new_stage: input.stage,
  });
}

export function deleteTodos(client: TodoRpcClient, input: { workspaceId: string; ids: string[] }) {
  return write(client, "delete_todo_items", { target_workspace_id: input.workspaceId, item_ids: input.ids });
}

export function writeTimeZone(client: TodoRpcClient, zone: string) {
  return write(client, "set_my_time_zone", { zone });
}
