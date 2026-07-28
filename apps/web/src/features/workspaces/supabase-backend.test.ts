import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  storageFrom: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { createSupabaseWorkspaceBackend } from "./supabase-backend";

describe("listUserWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
      storage: { from: mocks.storageFrom },
    });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.storageFrom.mockReturnValue({ getPublicUrl: mocks.getPublicUrl });
  });

  it("orders workspaces oldest-membership-first and resolves logo URLs", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.order.mockResolvedValue({
      data: [
        {
          organizations: {
            id: "org-1",
            name: "Northstar",
            logo_path: "user-1/northstar.png",
          },
        },
        {
          organizations: { id: "org-2", name: "Basecamp", logo_path: null },
        },
      ],
      error: null,
    });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.com/northstar.png" },
    });

    const backend = createSupabaseWorkspaceBackend();
    const workspaces = await backend.listUserWorkspaces();

    expect(mocks.from).toHaveBeenCalledWith("memberships");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.order).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
    expect(workspaces).toEqual([
      {
        organizationId: "org-1",
        organizationName: "Northstar",
        organizationLogoUrl: "https://example.com/northstar.png",
      },
      {
        organizationId: "org-2",
        organizationName: "Basecamp",
        organizationLogoUrl: null,
      },
    ]);
  });

  it("returns no workspaces for a signed-out caller", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const backend = createSupabaseWorkspaceBackend();
    await expect(backend.listUserWorkspaces()).resolves.toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
