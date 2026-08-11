// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  isWorkspaceFakeEnabled: vi.fn(),
  getFakeWorkspaceContext: vi.fn(),
  listRooms: vi.fn(),
  listFakeUserWorkspaces: vi.fn(),
  listFakeWorkspaceProjects: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));

vi.mock("@/features/workspaces/e2e-fake", () => ({
  isWorkspaceFakeEnabled: mocks.isWorkspaceFakeEnabled,
  getFakeWorkspaceContext: mocks.getFakeWorkspaceContext,
  listFakeUserWorkspaces: mocks.listFakeUserWorkspaces,
  listFakeWorkspaceProjects: mocks.listFakeWorkspaceProjects,
}));

vi.mock("@/features/workspaces/e2e-gate", () => ({
  isWorkspaceFakeEnabled: mocks.isWorkspaceFakeEnabled,
}));

vi.mock("@/features/rooms/queries", () => ({
  listRooms: mocks.listRooms,
}));

import WorkspaceLayout from "./layout";

describe("workspace layout auth guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listRooms.mockResolvedValue([]);
    mocks.listFakeUserWorkspaces.mockResolvedValue([]);
    mocks.listFakeWorkspaceProjects.mockResolvedValue([]);
  });

  it("sends a signed-out real-mode visitor back to the workspace home, not settings", async () => {
    mocks.isWorkspaceFakeEnabled.mockReturnValue(false);
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(
      WorkspaceLayout({
        children: null,
        params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
      }),
    ).rejects.toThrow(
      new RegExp(
        `^redirect:/sign-in\\?next=${encodeURIComponent(
          `/${WORKSPACE_ID}`,
        )}$`,
      ),
    );
  });

  it("sends a fake-mode visitor with no workspace context back to the workspace home, not settings", async () => {
    mocks.isWorkspaceFakeEnabled.mockReturnValue(true);
    mocks.getFakeWorkspaceContext.mockResolvedValue(null);

    await expect(
      WorkspaceLayout({
        children: null,
        params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
      }),
    ).rejects.toThrow(
      new RegExp(
        `^redirect:/sign-in\\?next=${encodeURIComponent(
          `/${WORKSPACE_ID}`,
        )}$`,
      ),
    );
  });

  it("loads Projects from the fake backend for an authenticated fake workspace", async () => {
    mocks.isWorkspaceFakeEnabled.mockReturnValue(true);
    mocks.getFakeWorkspaceContext.mockResolvedValue({
      user: { id: "10000000-0000-4000-8000-000000000001" },
      membership: { role: "admin" },
      workspace: { id: WORKSPACE_ID, name: "Northstar" },
    });
    mocks.listFakeWorkspaceProjects.mockResolvedValue([
      {
        id: "70000000-0000-4000-8000-000000000007",
        workspaceId: WORKSPACE_ID,
        name: "Mobile onboarding",
        createdBy: "10000000-0000-4000-8000-000000000001",
      },
    ]);

    await expect(
      WorkspaceLayout({
        children: null,
        params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
      }),
    ).resolves.toBeTruthy();

    expect(mocks.listFakeWorkspaceProjects).toHaveBeenCalledWith(
      WORKSPACE_ID,
    );
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
