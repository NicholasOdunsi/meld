// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";
const mocks = vi.hoisted(() => ({
  renameProject: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/features/projects/actions", () => ({
  renameProject: mocks.renameProject,
}));

import { RenameProjectDialog } from "./rename-project-dialog";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("renames the project and refreshes the workspace layout", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  mocks.renameProject.mockResolvedValue({
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Activation v2",
    createdBy: "10000000-0000-4000-8000-000000000001",
  });

  render(
    <RenameProjectDialog
      workspaceId={WORKSPACE_ID}
      project={{ id: PROJECT_ID, name: "Activation" }}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  const name = screen.getByRole("textbox", { name: "Name" });
  expect(name).toHaveValue("Activation");
  await user.clear(name);
  await user.type(name, "Activation v2");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(mocks.renameProject).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    name: "Activation v2",
  });
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("keeps the dialog open when renaming fails", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  mocks.renameProject.mockRejectedValue(new Error("We could not rename the project."));

  render(
    <RenameProjectDialog
      workspaceId={WORKSPACE_ID}
      project={{ id: PROJECT_ID, name: "Activation" }}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(await screen.findByText("We could not rename the project.")).toBeVisible();
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
});
