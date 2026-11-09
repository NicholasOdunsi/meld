"use client";

import type { TodoItem, TodoStage } from "@meld/contracts";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { List, ListItem } from "@astryxdesign/core/List";
import { StackItem } from "@astryxdesign/core/Stack";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { type FormEvent, type ReactNode, useState } from "react";
import { PixelTrash as Trash } from "@/ui/pixel-icons";
import {
  deleteTodoItems,
  moveTodoItems,
  saveTodo,
  type TodoActionResult,
} from "../actions";

type Project = { id: string; name: string };
type Line = {
  id: string;
  text: string;
  projectId: string | null;
  stage: TodoStage;
  position: number;
  saved: boolean;
};

const toLine = (item: TodoItem): Line => ({ ...item, saved: true });
const blank = (position: number): Line => ({
  id: crypto.randomUUID(),
  text: "",
  projectId: null,
  stage: "todo",
  position,
  saved: false,
});
const nextPosition = (lines: Line[]) =>
  Math.max(0, ...lines.map((line) => line.position)) + 1;

export function TodoSection({
  workspaceId,
  projects,
  initialTodos,
}: {
  workspaceId: string;
  projects: Project[];
  initialTodos: TodoItem[];
}) {
  const [lines, setLines] = useState<Line[]>(() => {
    const saved = initialTodos.map(toLine);
    return [...saved, blank(nextPosition(saved))];
  });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const todo = lines.filter((l) => l.stage === "todo");
  const inProgress = lines.filter((l) => l.stage === "in_progress");
  const completed = lines.filter((l) => l.stage === "done").reverse();
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name;

  async function optimistic(
    change: (current: Line[]) => Line[],
    call: () => Promise<TodoActionResult>,
  ) {
    const before = lines;
    setLines(change);
    const result = await call();
    if (result.status === "error") {
      setLines(before);
      setError(result.message);
    } else {
      setError(null);
    }
  }

  function commit(line: Line) {
    const text = line.text.trim();
    if (!text) return;
    void optimistic(
      (current) => {
        const updated = current.map((l) =>
          l.id === line.id ? { ...line, text, saved: true } : l,
        );
        return updated.some((l) => l.stage === "todo" && !l.text.trim())
          ? updated
          : [...updated, blank(nextPosition(updated))];
      },
      () =>
        saveTodo({
          workspaceId,
          id: line.id,
          text,
          projectId: line.projectId,
          position: line.position,
        }),
    );
  }

  function move(ids: string[], stage: TodoStage) {
    setChecked(new Set());
    void optimistic(
      (current) =>
        current.map((l) => (ids.includes(l.id) ? { ...l, stage } : l)),
      () => moveTodoItems({ workspaceId, ids, stage }),
    );
  }

  function remove(id: string) {
    void optimistic(
      (current) => current.filter((l) => l.id !== id),
      () => deleteTodoItems({ workspaceId, ids: [id] }),
    );
  }

  function setProject(line: Line, projectId: string | null) {
    const updated = { ...line, projectId };
    setLines((current) =>
      current.map((l) => (l.id === line.id ? updated : l)),
    );
    if (line.saved) commit(updated);
  }

  function submitLine(event: FormEvent<HTMLFormElement>, line: Line) {
    event.preventDefault();
    commit(line);
  }

  const readOnlyRow = (line: Line, action?: ReactNode) => (
    <ListItem
      key={line.id}
      label={line.text}
      description={projectName(line.projectId)}
      endContent={action}
    />
  );

  return (
    <VStack gap={6} width="100%">
      <VStack gap={3} width="100%">
        <HStack justify="between" align="center" width="100%">
          <Heading level={2}>Todo</Heading>
          {checked.size > 0 ? (
            <Button
              label="Orchestrate"
              variant="primary"
              onClick={() => move([...checked], "in_progress")}
            />
          ) : null}
        </HStack>
        {error ? <Banner status="error" title={error} /> : null}
        <VStack gap={2} width="100%">
          {todo.map((line) => (
            <HStack key={line.id} gap={3} align="center" width="100%">
              <CheckboxInput
                label={line.text ? `Select ${line.text}` : "Select to-do"}
                isLabelHidden
                value={checked.has(line.id)}
                isDisabled={!line.saved}
                onChange={(value: boolean) =>
                  setChecked((current) => {
                    const next = new Set(current);
                    if (value) next.add(line.id);
                    else next.delete(line.id);
                    return next;
                  })
                }
              />
              <StackItem size="fill">
                <form onSubmit={(event) => submitLine(event, line)}>
                  <TextInput
                    label="To-do"
                    isLabelHidden
                    placeholder={line.saved ? undefined : "Add a to-do"}
                    value={line.text}
                    onChange={(text: string) =>
                      setLines((current) =>
                        current.map((l) =>
                          l.id === line.id ? { ...l, text } : l,
                        ),
                      )
                    }
                  />
                </form>
              </StackItem>
              <DropdownMenu
                button={{
                  label: projectName(line.projectId) ?? "Project",
                  variant: "ghost",
                  size: "sm",
                }}
                items={[
                  {
                    label: "No project",
                    onClick: () => setProject(line, null),
                  },
                  ...projects.map((p) => ({
                    label: p.name,
                    onClick: () => setProject(line, p.id),
                  })),
                ]}
              />
              {line.saved ? (
                <IconButton
                  label="Delete to-do"
                  tooltip="Delete to-do"
                  icon={<Icon icon={Trash} size="sm" />}
                  variant="ghost"
                  onClick={() => remove(line.id)}
                />
              ) : null}
            </HStack>
          ))}
        </VStack>
      </VStack>

      {inProgress.length > 0 ? (
        <VStack gap={3} width="100%">
          <Heading level={2}>In progress</Heading>
          <List density="compact">
            {inProgress.map((line) =>
              readOnlyRow(
                line,
                <Button
                  label={`Mark ${line.text} done`}
                  variant="ghost"
                  size="sm"
                  onClick={() => move([line.id], "done")}
                >
                  Mark done
                </Button>,
              ),
            )}
          </List>
        </VStack>
      ) : null}

      {completed.length > 0 ? (
        <VStack gap={3} width="100%">
          <Button
            label={`Completed · ${completed.length}`}
            variant="ghost"
            onClick={() => setShowCompleted((open) => !open)}
          />
          {showCompleted ? (
            <List density="compact">
              {completed.map((line) => readOnlyRow(line))}
            </List>
          ) : null}
        </VStack>
      ) : null}
    </VStack>
  );
}
