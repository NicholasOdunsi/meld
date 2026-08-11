// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";
const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/features/projects/actions", () => ({
  createProject: mocks.createProject,
}));

import { CreateProjectDialog } from "./create-project-dialog";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("validates the name and closes only after creation succeeds", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  mocks.createProject.mockResolvedValue({
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Activation",
    createdBy: "10000000-0000-4000-8000-000000000001",
  });

  render(
    <CreateProjectDialog
      workspaceId={WORKSPACE_ID}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: "Name" }), "  Activation  ");
  await user.click(screen.getByRole("button", { name: "Create project" }));

  expect(mocks.createProject).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    name: "Activation",
  });
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("keeps the dialog open and shows a stable error after failure", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  mocks.createProject.mockRejectedValue(new Error("We could not create the project."));

  render(
    <CreateProjectDialog
      workspaceId={WORKSPACE_ID}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  await user.type(screen.getByRole("textbox", { name: "Name" }), "Activation");
  await user.click(screen.getByRole("button", { name: "Create project" }));

  expect(await screen.findByText("We could not create the project.")).toBeVisible();
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
