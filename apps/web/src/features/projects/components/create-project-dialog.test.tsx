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
  const createdProject = {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Activation",
    createdBy: "10000000-0000-4000-8000-000000000001",
    icon: "folder",
    color: "blue",
  };
  mocks.createProject.mockResolvedValue({
    status: "ok",
    project: createdProject,
  });

  render(
    <CreateProjectDialog
      workspaceId={WORKSPACE_ID}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  await user.type(
    screen.getByRole("textbox", { name: "Name" }),
    "  Activation  ",
  );
  await user.click(screen.getByRole("button", { name: "Create project" }));

  expect(mocks.createProject).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    name: "Activation",
    icon: "folder",
    color: "blue",
  });
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(mocks.refresh).toHaveBeenCalledOnce();
});

it("lets a user pick a different icon before creating", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const createdProject = {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Activation",
    createdBy: "10000000-0000-4000-8000-000000000001",
    icon: "rocket",
    color: "blue",
  };
  mocks.createProject.mockResolvedValue({
    status: "ok",
    project: createdProject,
  });

  render(
    <CreateProjectDialog
      workspaceId={WORKSPACE_ID}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  // "Growth" is the picker label for the "rocket" icon key -- the label
  // names the glyph shown (a trending chart), not the stored key.
  await user.click(screen.getByRole("button", { name: "Growth" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Activation");
  await user.click(screen.getByRole("button", { name: "Create project" }));

  expect(mocks.createProject).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    name: "Activation",
    icon: "rocket",
    color: "blue",
  });
});

it("lets a user pick a different colour before creating", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  const createdProject = {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Activation",
    createdBy: "10000000-0000-4000-8000-000000000001",
    icon: "folder",
    color: "purple",
  };
  mocks.createProject.mockResolvedValue({
    status: "ok",
    project: createdProject,
  });

  render(
    <CreateProjectDialog
      workspaceId={WORKSPACE_ID}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  await user.click(screen.getByRole("button", { name: "Purple" }));
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Activation");
  await user.click(screen.getByRole("button", { name: "Create project" }));

  expect(mocks.createProject).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    name: "Activation",
    icon: "folder",
    color: "purple",
  });
});

// The action returns its refusal rather than throwing it. Mocking a rejection
// with the friendly string -- what this test used to do -- asserts the mock:
// Next redacts a thrown Server Action message in a production build, so that
// path renders Next's placeholder to real users and the copy is dead.
it("keeps the dialog open and shows the error the action returned", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  mocks.createProject.mockResolvedValue({
    status: "error",
    message: "We could not create the project.",
  });

  render(
    <CreateProjectDialog
      workspaceId={WORKSPACE_ID}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  await user.type(screen.getByRole("textbox", { name: "Name" }), "Activation");
  await user.click(screen.getByRole("button", { name: "Create project" }));

  expect(
    await screen.findByText("We could not create the project."),
  ).toBeVisible();
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
  expect(mocks.refresh).not.toHaveBeenCalled();
});

// The deployed shape of a *thrown* Server Action error: the message is
// replaced and a digest is attached. The dialog must not render that.
it("falls back to its own copy when a throw crosses the action boundary", async () => {
  const user = userEvent.setup();
  const onOpenChange = vi.fn();
  mocks.createProject.mockRejectedValue(
    Object.assign(
      new Error(
        "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.",
      ),
      { digest: "3081332443" },
    ),
  );

  render(
    <CreateProjectDialog
      workspaceId={WORKSPACE_ID}
      isOpen
      onOpenChange={onOpenChange}
    />,
  );

  await user.type(screen.getByRole("textbox", { name: "Name" }), "Activation");
  await user.click(screen.getByRole("button", { name: "Create project" }));

  expect(
    await screen.findByText("We could not create the project."),
  ).toBeVisible();
  expect(
    screen.queryByText(/omitted in production builds/),
  ).not.toBeInTheDocument();
  expect(onOpenChange).not.toHaveBeenCalledWith(false);
});
