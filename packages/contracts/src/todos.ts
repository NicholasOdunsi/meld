// packages/contracts/src/todos.ts
import { z } from "zod";

export const TODO_TEXT_MAX = 500;

export const TodoStageSchema = z.enum(["todo", "in_progress", "done"]);
export type TodoStage = z.infer<typeof TodoStageSchema>;

export const TodoItemSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  text: z.string().trim().min(1).max(TODO_TEXT_MAX),
  stage: TodoStageSchema,
  position: z.number(),
  createdAt: z.string(),
});
export type TodoItem = z.infer<typeof TodoItemSchema>;

export const MorningTodosOutputSchema = z.object({
  summary: z.string().max(8000),
  todos: z.array(z.string()).max(20).default([]),
});
export type MorningTodosOutput = z.infer<typeof MorningTodosOutputSchema>;

/** The dedupe key: lowercase, letters/digits/spaces only, spaces collapsed. */
export function normalizeTodoText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}
