"use client";

import { useEffect, useState } from "react";
import {
  MeldTodoWidget,
  type MeldTodoItem,
  type MeldTodoPriority,
} from "@/ui/meld/todo-widget";

export type TodoRecord = MeldTodoItem & { isInProgress: boolean };

export type TodoPanelProps = {
  /** Scopes storage, so two workspaces do not share a list. */
  workspaceId: string;
  title?: string;
};

export function todoStorageKey(workspaceId: string): string {
  return `meld:todos:${workspaceId}`;
}

/**
 * Reads the stored list, tolerating anything that is not the shape we wrote.
 * Storage is user-writable and survives deploys, so a bad value must degrade to
 * an empty list rather than take the deck down with it.
 */
export function parseTodos(raw: string | null): TodoRecord[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): TodoRecord[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const { id, text, priority, isInProgress } = entry as Record<
        string,
        unknown
      >;
      if (typeof id !== "string" || typeof text !== "string") return [];
      return [
        {
          id,
          text,
          priority: (["none", "low", "medium", "high"] as const).includes(
            priority as MeldTodoPriority,
          )
            ? (priority as MeldTodoPriority)
            : "none",
          isInProgress: isInProgress === true,
        },
      ];
    });
  } catch {
    return [];
  }
}

/**
 * The deck's to-do list.
 *
 * **Persistence is `localStorage`, not the database.** That is a deliberate
 * limit, not an oversight: storing a task server-side needs a table, an RLS
 * policy and a write path, and this branch does not touch the backend. The
 * consequence is worth stating plainly -- a list written here lives in this
 * browser on this machine, and will not follow you to another device.
 */
export function TodoPanel({ workspaceId, title = "Tasks" }: TodoPanelProps) {
  const [todos, setTodos] = useState<TodoRecord[]>([]);
  const [draft, setDraft] = useState("");
  const [priority, setPriority] = useState<MeldTodoPriority>("none");
  // Storage is read after mount, never during render: the server has no
  // `localStorage`, and reading it while rendering would mismatch hydration.
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setTodos(parseTodos(window.localStorage.getItem(todoStorageKey(workspaceId))));
    setIsLoaded(true);
  }, [workspaceId]);

  useEffect(() => {
    if (!isLoaded) return;
    window.localStorage.setItem(
      todoStorageKey(workspaceId),
      JSON.stringify(todos),
    );
  }, [todos, workspaceId, isLoaded]);

  function addTodo() {
    const text = draft.trim();
    if (!text) return;
    setTodos((current) => [
      ...current,
      {
        id: `${Date.now().toString(36)}-${current.length}`,
        text,
        priority,
        isInProgress: false,
      },
    ]);
    setDraft("");
  }

  // One control, two steps: an untouched task starts, a started task completes
  // and leaves the list. Anything else needs a menu, and the menu is not built.
  function advance(id: string) {
    setTodos((current) =>
      current.flatMap((todo) => {
        if (todo.id !== id) return [todo];
        return todo.isInProgress ? [] : [{ ...todo, isInProgress: true }];
      }),
    );
  }

  return (
    <MeldTodoWidget
      title={title}
      groups={[
        {
          label: "In Progress",
          items: todos.filter((todo) => todo.isInProgress),
        },
        { label: "To do", items: todos.filter((todo) => !todo.isInProgress) },
      ]}
      draft={draft}
      onDraftChange={setDraft}
      onSubmit={addTodo}
      priority={priority}
      onPriorityChange={setPriority}
      onAdvance={advance}
    />
  );
}
