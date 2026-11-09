"use server";

import { TODO_TEXT_MAX, TodoStageSchema, type TodoItem } from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { deleteTodos, moveTodos, readTodos, writeTimeZone, writeTodo, type TodoRpcClient } from "./todo-store";

export type TodoActionResult = { status: "ok" } | { status: "error"; message: string };

const WRITE_ERROR = "We could not update your to-dos. Try again.";
const failed: TodoActionResult = { status: "error", message: WRITE_ERROR };

const Uuid = z.string().uuid();
const Ids = z.array(Uuid).min(1).max(500);
const SaveSchema = z.object({
  workspaceId: Uuid,
  id: Uuid,
  text: z.string().trim().min(1).max(TODO_TEXT_MAX),
  projectId: Uuid.nullable(),
  position: z.number().finite(),
});
const MoveSchema = z.object({ workspaceId: Uuid, ids: Ids, stage: TodoStageSchema });
const DeleteSchema = z.object({ workspaceId: Uuid, ids: Ids });
const ZoneSchema = z.string().regex(/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+){0,2}$/).max(64);

async function client(): Promise<TodoRpcClient> {
  return (await createClient(new Headers())) as unknown as TodoRpcClient;
}

async function attempt(run: () => Promise<void>): Promise<TodoActionResult> {
  try {
    await run();
    return { status: "ok" };
  } catch {
    return failed;
  }
}

export async function listTodos(workspaceId: string): Promise<TodoItem[]> {
  return readTodos(await client(), Uuid.parse(workspaceId));
}

export async function saveTodo(input: z.input<typeof SaveSchema>): Promise<TodoActionResult> {
  const parsed = SaveSchema.safeParse(input);
  if (!parsed.success) return failed;
  return attempt(async () => writeTodo(await client(), parsed.data));
}

export async function moveTodoItems(input: z.input<typeof MoveSchema>): Promise<TodoActionResult> {
  const parsed = MoveSchema.safeParse(input);
  if (!parsed.success) return failed;
  return attempt(async () => moveTodos(await client(), parsed.data));
}

export async function deleteTodoItems(input: z.input<typeof DeleteSchema>): Promise<TodoActionResult> {
  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) return failed;
  return attempt(async () => deleteTodos(await client(), parsed.data));
}

export async function setTimeZone(zone: string): Promise<TodoActionResult> {
  const parsed = ZoneSchema.safeParse(zone);
  if (!parsed.success) return failed;
  return attempt(async () => writeTimeZone(await client(), parsed.data));
}
