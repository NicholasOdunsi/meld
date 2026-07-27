import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { GET } from "./route";

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
        },
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
