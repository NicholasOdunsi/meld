// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { MeldTodoWidget, type MeldTodoGroup } from "./todo-widget";

// The widget owns no state, so every test supplies the controlled props. Only
// the ones a test asserts on are overridden.
function renderWidget(props: Partial<Parameters<typeof MeldTodoWidget>[0]> = {}) {
  return render(
    <MeldTodoWidget
      title="Peekaboo"
      groups={[]}
      draft=""
      onDraftChange={vi.fn()}
      onSubmit={vi.fn()}
      priority="none"
      onPriorityChange={vi.fn()}
      onAdvance={vi.fn()}
      {...props}
    />,
  );
}

afterEach(cleanup);

const GROUPS: MeldTodoGroup[] = [
  {
    label: "In Progress",
    items: [
      {
        id: "a",
        text: "Fix update Synara: update sometimes gets in stall",
        priority: "high",
        isInProgress: true,
      },
    ],
  },
  {
    label: "To do",
    items: [
      { id: "b", text: "Finish droid", priority: "high" },
      { id: "c", text: "Fable 5: Remodex is thinking text fix", priority: "medium" },
      { id: "d", text: "Improve Synara", priority: "none" },
    ],
  },
];

// The composer is the way in, so an empty list still has to be on screen --
// hiding the widget would hide the only place a first task can be typed.
it("still shows the widget and its composer when there is nothing to do", () => {
  renderWidget({ groups: [] });

  expect(screen.getByTestId("todo-widget")).toBeInTheDocument();
  expect(
    screen.getByRole("textbox", { name: "What needs doing?" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Peekaboo")).toBeInTheDocument();
});

it("prints no active count when the list is empty", () => {
  renderWidget({ groups: [{ label: "To do", items: [] }] });

  expect(screen.queryByText(/Active Tasks/)).toBeNull();
  expect(screen.queryByText("To do · 0")).toBeNull();
});

it("counts every item across groups in the header", () => {
  renderWidget({ groups: GROUPS });

  expect(screen.getByText("Peekaboo")).toBeInTheDocument();
  expect(screen.getByText("· 4 Active Tasks")).toBeInTheDocument();
});

it("labels each group with its own count", () => {
  renderWidget({ groups: GROUPS });

  expect(screen.getByText("In Progress · 1")).toBeInTheDocument();
  expect(screen.getByText("To do · 3")).toBeInTheDocument();
});

it("lists every item", () => {
  renderWidget({ groups: GROUPS });

  expect(screen.getByText("Finish droid")).toBeInTheDocument();
  expect(screen.getByText("Improve Synara")).toBeInTheDocument();
});

it("hides a group that has no items rather than printing a zero", () => {
  renderWidget({ groups: [...GROUPS, { label: "Backlog", items: [] }] });

  expect(screen.queryByText("Backlog · 0")).toBeNull();
});

it("shows the composer prompt as the input's placeholder", () => {
  renderWidget({ groups: GROUPS });

  expect(screen.getByRole("textbox")).toHaveAttribute(
    "placeholder",
    "What needs doing?",
  );
});

it("submits the draft and clears the composer through its callbacks", async () => {
  const onSubmit = vi.fn();
  const onDraftChange = vi.fn();
  const user = userEvent.setup();

  renderWidget({ draft: "Finish droid", onSubmit, onDraftChange });

  await user.click(screen.getByRole("button", { name: "Add task" }));
  expect(onSubmit).toHaveBeenCalledTimes(1);

  await user.type(screen.getByRole("textbox"), "!");
  expect(onDraftChange).toHaveBeenCalled();
});

it("cannot submit an empty or whitespace-only draft", () => {
  renderWidget({ draft: "   " });

  expect(screen.getByRole("button", { name: "Add task" })).toBeDisabled();
});

it("marks the selected priority as pressed", () => {
  renderWidget({ priority: "high" });

  expect(screen.getByRole("button", { name: "High" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("button", { name: "Low" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

it("advances the item whose ring was clicked", async () => {
  const onAdvance = vi.fn();
  const user = userEvent.setup();

  renderWidget({ groups: GROUPS, onAdvance });

  await user.click(screen.getByRole("button", { name: "Start Finish droid" }));

  expect(onAdvance).toHaveBeenCalledWith("b");
});
