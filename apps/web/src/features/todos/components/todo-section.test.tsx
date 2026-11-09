// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saveTodo = vi.fn();
const moveTodoItems = vi.fn();
const deleteTodoItems = vi.fn();
vi.mock("../actions", () => ({
  saveTodo: (...a: unknown[]) => saveTodo(...a),
  moveTodoItems: (...a: unknown[]) => moveTodoItems(...a),
  deleteTodoItems: (...a: unknown[]) => deleteTodoItems(...a),
}));

import { TodoSection } from "./todo-section";

const WS = "b2000000-0000-4000-8000-000000000001";
const P1 = "b7000000-0000-4000-8000-000000000001";
const line = (
  id: string,
  text: string,
  stage: "todo" | "in_progress" | "done",
  position: number,
) => ({
  id: `b8000000-0000-4000-8000-00000000000${id}`,
  projectId: P1,
  text,
  stage,
  position,
  createdAt: "",
});
const todo = line("1", "Draft pricing", "todo", 1);
const working = line("2", "Build onboarding", "in_progress", 2);
const done = line("3", "Write the PRD", "done", 3);

describe("TodoSection", () => {
  beforeEach(() => {
    for (const fn of [saveTodo, moveTodoItems, deleteTodoItems]) {
      fn.mockReset().mockResolvedValue({ status: "ok" });
    }
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the three lists, with Completed collapsed", async () => {
    render(
      <TodoSection
        workspaceId={WS}
        projects={[{ id: P1, name: "Mark" }]}
        initialTodos={[todo, working, done]}
      />,
    );
    expect(screen.getByDisplayValue("Draft pricing")).toBeInTheDocument();
    expect(screen.getByText("Build onboarding")).toBeInTheDocument();
    expect(screen.queryByText("Write the PRD")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Completed · 1" }));
    expect(screen.getByText("Write the PRD")).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText("Add a to-do")).toHaveLength(1);
  });

  it("saves a new line on Enter", async () => {
    render(<TodoSection workspaceId={WS} projects={[]} initialTodos={[]} />);
    await userEvent.type(screen.getByPlaceholderText("Add a to-do"), "Ship it{Enter}");
    expect(saveTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        text: "Ship it",
        projectId: null,
        position: 1,
      }),
    );
  });

  it("orchestrates ticked lines into In progress", async () => {
    render(<TodoSection workspaceId={WS} projects={[]} initialTodos={[todo]} />);
    expect(
      screen.queryByRole("button", { name: "Orchestrate" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select Draft pricing" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Orchestrate" }));
    expect(moveTodoItems).toHaveBeenCalledWith({
      workspaceId: WS,
      ids: [todo.id],
      stage: "in_progress",
    });
    expect(screen.getByText("Draft pricing")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Draft pricing")).not.toBeInTheDocument();
  });

  it("marks an in-progress line done", async () => {
    render(
      <TodoSection workspaceId={WS} projects={[]} initialTodos={[working]} />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Mark Build onboarding done" }),
    );
    expect(moveTodoItems).toHaveBeenCalledWith({
      workspaceId: WS,
      ids: [working.id],
      stage: "done",
    });
  });

  it("deletes a todo line, and puts it back when that fails", async () => {
    deleteTodoItems.mockResolvedValue({
      status: "error",
      message: "We could not update your to-dos. Try again.",
    });
    render(<TodoSection workspaceId={WS} projects={[]} initialTodos={[todo]} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete to-do" }));
    expect(deleteTodoItems).toHaveBeenCalledWith({
      workspaceId: WS,
      ids: [todo.id],
    });
    expect(await screen.findByDisplayValue("Draft pricing")).toBeInTheDocument();
    expect(
      screen.getByText("We could not update your to-dos. Try again."),
    ).toBeInTheDocument();
  });
});
