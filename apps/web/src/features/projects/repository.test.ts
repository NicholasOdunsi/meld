import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createProjectRepository } from "./repository";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

function projectsQuery(data: unknown, error: unknown = null) {
  const order = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return {
    supabase: { from } as unknown as SupabaseClient,
    from,
    select,
    eq,
    order,
  };
}

describe("project repository", () => {
  it("lists mapped workspace projects", async () => {
    const query = projectsQuery([
      {
        id: PROJECT_ID,
        workspace_id: WORKSPACE_ID,
        name: "Mobile onboarding",
        created_by: OWNER_ID,
        icon: "rocket",
        color: "purple",
      },
    ]);

    await expect(
      createProjectRepository(query.supabase).listWorkspaceProjects(
        WORKSPACE_ID,
      ),
    ).resolves.toEqual([
      {
        id: PROJECT_ID,
        workspaceId: WORKSPACE_ID,
        name: "Mobile onboarding",
        createdBy: OWNER_ID,
        icon: "rocket",
        color: "purple",
      },
    ]);
    expect(query.from).toHaveBeenCalledWith("projects");
    expect(query.select).toHaveBeenCalledWith(
      "id,workspace_id,name,created_by,icon,color",
    );
    expect(query.eq).toHaveBeenCalledWith("workspace_id", WORKSPACE_ID);
    expect(query.order).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
  });

  it("falls back to the default icon and colour for an unrecognized stored value", async () => {
    const query = projectsQuery([
      {
        id: PROJECT_ID,
        workspace_id: WORKSPACE_ID,
        name: "Mobile onboarding",
        created_by: OWNER_ID,
        icon: "not-a-real-icon",
        color: "not-a-real-color",
      },
    ]);

    const [project] = await createProjectRepository(
      query.supabase,
    ).listWorkspaceProjects(WORKSPACE_ID);
    expect(project.icon).toBe("folder");
    expect(project.color).toBe("blue");
  });

  it("creates a project with its authenticated creator", async () => {
    const createdRow = {
      id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
      name: "Mobile onboarding",
      created_by: OWNER_ID,
      icon: "folder",
      color: "blue",
    };
    const single = vi.fn().mockResolvedValue({ data: createdRow, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const supabase = { from } as unknown as SupabaseClient;

    await expect(
      createProjectRepository(supabase).createProject({
        workspaceId: WORKSPACE_ID,
        name: "Mobile onboarding",
        createdBy: OWNER_ID,
      }),
    ).resolves.toMatchObject({ id: PROJECT_ID, createdBy: OWNER_ID });
    expect(insert).toHaveBeenCalledWith({
      workspace_id: WORKSPACE_ID,
      name: "Mobile onboarding",
      created_by: OWNER_ID,
      icon: "folder",
      color: "blue",
    });
  });

  it("creates a project with the requested icon and colour", async () => {
    const createdRow = {
      id: PROJECT_ID,
      workspace_id: WORKSPACE_ID,
      name: "Mobile onboarding",
      created_by: OWNER_ID,
      icon: "rocket",
      color: "purple",
    };
    const single = vi.fn().mockResolvedValue({ data: createdRow, error: null });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));
    const supabase = { from } as unknown as SupabaseClient;

    const writeInput = {
      workspaceId: WORKSPACE_ID,
      name: "Mobile onboarding",
      createdBy: OWNER_ID,
      icon: "rocket" as const,
      color: "purple" as const,
    };
    await createProjectRepository(supabase).createProject(writeInput);
    expect(insert).toHaveBeenCalledWith({
      workspace_id: WORKSPACE_ID,
      name: "Mobile onboarding",
      created_by: OWNER_ID,
      icon: "rocket",
      color: "purple",
    });
  });

  it("renames only the requested workspace project", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: PROJECT_ID,
        workspace_id: WORKSPACE_ID,
        name: "Activation",
        created_by: OWNER_ID,
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const secondEq = vi.fn(() => ({ select }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const update = vi.fn(() => ({ eq: firstEq }));
    const from = vi.fn(() => ({ update }));
    const supabase = { from } as unknown as SupabaseClient;

    await createProjectRepository(supabase).renameProject({
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      name: "Activation",
    });

    expect(update).toHaveBeenCalledWith({ name: "Activation" });
    expect(firstEq).toHaveBeenCalledWith("id", PROJECT_ID);
    expect(secondEq).toHaveBeenCalledWith("workspace_id", WORKSPACE_ID);
  });

  it("surfaces a stable restriction error for a non-empty project", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23503", message: "foreign key violation" },
    });
    const select = vi.fn(() => ({ single }));
    const secondEq = vi.fn(() => ({ select }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const deleteQuery = vi.fn(() => ({ eq: firstEq }));
    const from = vi.fn(() => ({ delete: deleteQuery }));
    const supabase = { from } as unknown as SupabaseClient;

    await expect(
      createProjectRepository(supabase).deleteProject({
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
      }),
    ).rejects.toThrow(
      "Move or delete this project's rooms before deleting the project.",
    );
  });
});
