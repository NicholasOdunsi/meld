import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  membershipMaybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { GET } from "./route";

const STALE_WORKSPACE_ID = "6b1299c8-3671-4697-88f0-4ad080fc3a5c";

const REQUIRED_RESPONSE_HEADERS = {
  "Cache-Control":
    "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

describe("authentication callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.membershipMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mocks.createClient.mockImplementation(
      async (responseHeaders: Headers) => ({
        auth: {
          exchangeCodeForSession: async (code: string) => {
            Object.entries(REQUIRED_RESPONSE_HEADERS).forEach(
              ([name, value]) => {
                responseHeaders.set(name, value);
              },
            );
            return mocks.exchangeCodeForSession(code);
          },
          getUser: () => mocks.getUser(),
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => mocks.membershipMaybeSingle(),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("forwards auth cookie cache headers on a successful code exchange", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=valid&next=%2Fproducts",
      ),
    );

    expect(mocks.createClient).toHaveBeenCalledWith(expect.any(Headers));
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/products",
    );
    expect(response.headers.get("cache-control")).toBe(
      REQUIRED_RESPONSE_HEADERS["Cache-Control"],
    );
    expect(response.headers.get("expires")).toBe(
      REQUIRED_RESPONSE_HEADERS.Expires,
    );
    expect(response.headers.get("pragma")).toBe(
      REQUIRED_RESPONSE_HEADERS.Pragma,
    );
  });

  it("honors a workspace next when the user is a member", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.membershipMaybeSingle.mockResolvedValue({
      data: { workspace_id: STALE_WORKSPACE_ID },
      error: null,
    });

    const response = await GET(
      new Request(
        `http://localhost:3000/auth/callback?code=valid&next=%2F${STALE_WORKSPACE_ID}%2Frooms%2Froom-1`,
      ),
    );

    expect(response.headers.get("location")).toBe(
      `http://localhost:3000/${STALE_WORKSPACE_ID}/rooms/room-1`,
    );
  });

  it("falls back to / when the workspace next is no longer reachable", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.membershipMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await GET(
      new Request(
        `http://localhost:3000/auth/callback?code=valid&next=%2F${STALE_WORKSPACE_ID}`,
      ),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("falls back to / when the user cannot be resolved after exchange", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(
      new Request(
        `http://localhost:3000/auth/callback?code=valid&next=%2F${STALE_WORKSPACE_ID}`,
      ),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("forwards auth cookie cache headers on a failed code exchange", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      error: new Error("invalid code"),
    });

    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=invalid"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?error=callback",
    );
    expect(response.headers.get("cache-control")).toBe(
      REQUIRED_RESPONSE_HEADERS["Cache-Control"],
    );
    expect(response.headers.get("expires")).toBe(
      REQUIRED_RESPONSE_HEADERS.Expires,
    );
    expect(response.headers.get("pragma")).toBe(
      REQUIRED_RESPONSE_HEADERS.Pragma,
    );
  });
});
