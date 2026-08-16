// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";
const RESTRICTION = "Move or delete this project's rooms before deleting the project.";
const mocks = vi.hoisted(() => ({
  deleteProject: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/features/projects/actions", () => ({
  deleteProject: mocks.deleteProject,
}));

import { DeleteProjectDialog } from "./delete-project-dialog";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("confirms deletion and refreshes after success", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  mocks.deleteProject.mockResolvedValue({ status: "deleted" });

  render(
    <DeleteProjectDialog
      workspaceId={WORKSPACE_ID}
      project={{ id: PROJECT_ID, name: "Activation" }}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  expect(screen.getByText(/does not delete rooms/i)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Delete project" }));

  expect(mocks.deleteProject).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
  });
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("keeps a non-empty project dialog open and shows the restriction", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  mocks.deleteProject.mockResolvedValue({
    status: "blocked",
    reason: "project_not_empty",
    message: RESTRICTION,
  });

  render(
    <DeleteProjectDialog
      workspaceId={WORKSPACE_ID}
      project={{ id: PROJECT_ID, name: "Activation" }}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Delete project" }));

  expect(await screen.findByText(RESTRICTION)).toBeVisible();
  expect(screen.getByRole("alertdialog")).toBeVisible();
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
