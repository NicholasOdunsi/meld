import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectBackend: vi.fn(),
  listWorkspaceProjects: vi.fn(),
  createProject: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("./backend", () => ({
  getProjectBackend: mocks.getProjectBackend,
}));

import { ProjectNotEmptyError } from "./repository";

import {
  createProject,
  deleteProject,
  listWorkspaceProjects,
  renameProject,
} from "./actions";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

describe("project actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getProjectBackend.mockResolvedValue({
      listWorkspaceProjects: mocks.listWorkspaceProjects,
      createProject: mocks.createProject,
      renameProject: mocks.renameProject,
      deleteProject: mocks.deleteProject,
    });
  });

  it("lists projects through the selected backend", async () => {
    mocks.listWorkspaceProjects.mockResolvedValue([]);

    await expect(listWorkspaceProjects(WORKSPACE_ID)).resolves.toEqual([]);

    expect(mocks.listWorkspaceProjects).toHaveBeenCalledWith(WORKSPACE_ID);
    expect(mocks.getProjectBackend).toHaveBeenCalledOnce();
  });

  it("trims names, assigns the current user, and revalidates after create", async () => {
    const project = {
      id: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      name: "Mobile onboarding",
      createdBy: OWNER_ID,
    };
    mocks.createProject.mockResolvedValue(project);

    await expect(
      createProject({
        workspaceId: WORKSPACE_ID,
        name: "  Mobile onboarding  ",
      }),
    ).resolves.toEqual(project);

    expect(mocks.createProject).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      name: "Mobile onboarding",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/${WORKSPACE_ID}`,
      "layout",
    );
  });

  it("normalizes create validation failures", async () => {
    await expect(
      createProject({ workspaceId: "not-a-uuid", name: "" }),
    ).rejects.toThrow("We could not create the project.");
    expect(mocks.getProjectBackend).not.toHaveBeenCalled();
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("normalizes rename validation failures", async () => {
    await expect(
      renameProject({
        workspaceId: "not-a-uuid",
        projectId: PROJECT_ID,
        name: "",
      }),
    ).rejects.toThrow("We could not rename the project.");
    expect(mocks.getProjectBackend).not.toHaveBeenCalled();
    expect(mocks.renameProject).not.toHaveBeenCalled();
  });

  it("normalizes list and delete validation failures", async () => {
    await expect(listWorkspaceProjects("not-a-uuid")).rejects.toThrow(
      "We could not load projects.",
    );
    await expect(
      deleteProject({ workspaceId: WORKSPACE_ID, projectId: "bad-id" }),
    ).resolves.toEqual({
      status: "error",
      message: "We could not delete the project.",
    });
    expect(mocks.getProjectBackend).not.toHaveBeenCalled();
  });

  it("revalidates after rename and delete", async () => {
    mocks.renameProject.mockResolvedValue({ id: PROJECT_ID });
    mocks.deleteProject.mockResolvedValue(undefined);

    await renameProject({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      name: "Activation",
    });
    await expect(
      deleteProject({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID }),
    ).resolves.toEqual({ status: "deleted" });

    expect(mocks.revalidatePath).toHaveBeenCalledTimes(2);
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(
      1,
      `/${WORKSPACE_ID}`,
      "layout",
    );
    expect(mocks.revalidatePath).toHaveBeenNthCalledWith(
      2,
      `/${WORKSPACE_ID}`,
      "layout",
    );
  });

  it("preserves the stable non-empty Project restriction", async () => {
    mocks.deleteProject.mockRejectedValue(new ProjectNotEmptyError());

    await expect(
      deleteProject({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID }),
    ).resolves.toEqual({
      status: "blocked",
      reason: "project_not_empty",
      message:
        "Move or delete this project's rooms before deleting the project.",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("uses stable user-facing errors for repository failures", async () => {
    mocks.createProject.mockRejectedValue(new Error("raw database error"));

    await expect(
      createProject({ workspaceId: WORKSPACE_ID, name: "Activation" }),
    ).rejects.toThrow("We could not create the project.");
  });
});
