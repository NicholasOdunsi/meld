// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  isWorkspaceFakeEnabled: vi.fn(),
  getFakeOrganizationContext: vi.fn(),
  listDiscoveryRooms: vi.fn(),
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
  getFakeOrganizationContext: mocks.getFakeOrganizationContext,
}));

vi.mock("@/features/discovery/actions", () => ({
  listDiscoveryRooms: mocks.listDiscoveryRooms,
}));

import OrganizationLayout from "./layout";

describe("organization layout auth guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listDiscoveryRooms.mockResolvedValue([]);
  });

  it("sends a signed-out real-mode visitor back to the organization home, not settings", async () => {
    mocks.isWorkspaceFakeEnabled.mockReturnValue(false);
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(
      OrganizationLayout({
        children: null,
        params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
      }),
    ).rejects.toThrow(
      new RegExp(
        `^redirect:/sign-in\\?next=${encodeURIComponent(
          `/${ORGANIZATION_ID}`,
        )}$`,
      ),
    );
  });

  it("sends a fake-mode visitor with no organization context back to the organization home, not settings", async () => {
    mocks.isWorkspaceFakeEnabled.mockReturnValue(true);
    mocks.getFakeOrganizationContext.mockResolvedValue(null);

    await expect(
      OrganizationLayout({
        children: null,
        params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
      }),
    ).rejects.toThrow(
      new RegExp(
        `^redirect:/sign-in\\?next=${encodeURIComponent(
          `/${ORGANIZATION_ID}`,
        )}$`,
      ),
    );
  });
});
