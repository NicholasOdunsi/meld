import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
  order: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  select: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

import Home from "./page";

describe("root routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const membershipQuery = {
      eq: mocks.eq,
      limit: mocks.limit,
      maybeSingle: mocks.maybeSingle,
      order: mocks.order,
      select: mocks.select,
    };

    mocks.select.mockReturnValue(membershipQuery);
    mocks.eq.mockReturnValue(membershipQuery);
    mocks.order.mockReturnValue(membershipQuery);
    mocks.limit.mockReturnValue(membershipQuery);
    mocks.from.mockReturnValue(membershipQuery);
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
    });
  });

  it("redirects signed-out users to sign-in", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(Home()).rejects.toThrow("redirect:/sign-in");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("redirects new users to onboarding", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });

    await expect(Home()).rejects.toThrow("redirect:/onboarding");
  });

  it("redirects organization members to Discovery", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        organization_id: "30000000-0000-4000-8000-000000000003",
      },
      error: null,
    });

    await expect(Home()).rejects.toThrow(
      "redirect:/30000000-0000-4000-8000-000000000003/discovery",
    );
    expect(mocks.from).toHaveBeenCalledWith("memberships");
    expect(mocks.select).toHaveBeenCalledWith("organization_id");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.order).toHaveBeenNthCalledWith(1, "created_at", {
      ascending: true,
    });
    expect(mocks.order).toHaveBeenNthCalledWith(
      2,
      "organization_id",
      { ascending: true },
    );
    expect(mocks.limit).toHaveBeenCalledWith(1);
  });
});
