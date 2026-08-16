import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  createProject: vi.fn(),
  listWorkspaceProjects: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("./repository", () => ({
  createProjectRepository: () => ({
    createProject: mocks.createProject,
    listWorkspaceProjects: mocks.listWorkspaceProjects,
    renameProject: mocks.renameProject,
    deleteProject: mocks.deleteProject,
  }),
}));

import { createSupabaseProjectBackend } from "./supabase-backend";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";

describe("Supabase Project backend", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
  });

  it("derives the Project creator from the authenticated user", async () => {
    mocks.createProject.mockResolvedValue({ id: "project-id" });
    const backend = await createSupabaseProjectBackend();

    await backend.createProject({
      workspaceId: WORKSPACE_ID,
      name: "Mobile onboarding",
    });

    expect(mocks.createProject).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      name: "Mobile onboarding",
      createdBy: USER_ID,
    });
  });

  it("rejects an unauthenticated client before repository access", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(createSupabaseProjectBackend()).rejects.toThrow(
      "Authentication required",
    );
    expect(mocks.createProject).not.toHaveBeenCalled();
  });
});
