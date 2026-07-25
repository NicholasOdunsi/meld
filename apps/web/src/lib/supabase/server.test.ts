import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

import { createClient } from "./server";

const REQUIRED_RESPONSE_HEADERS = {
  "Cache-Control":
    "private, no-cache, no-store, must-revalidate, max-age=0",
  Expires: "0",
  Pragma: "no-cache",
};

describe("server Supabase client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves the response headers passed with auth cookie writes", async () => {
    const cookieStore = {
      getAll: vi.fn().mockReturnValue([]),
      set: vi.fn(),
    };
    let setAll:
      | ((
          cookiesToSet: {
            name: string;
            value: string;
            options: Record<string, unknown>;
          }[],
          headers: Record<string, string>,
        ) => void)
      | undefined;

    mocks.cookies.mockResolvedValue(cookieStore);
    mocks.createServerClient.mockImplementation(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            setAll: typeof setAll;
          };
        },
      ) => {
        setAll = options.cookies.setAll;
        return {};
      },
    );

    const responseHeaders = new Headers();
    await createClient(responseHeaders);
    setAll?.(
      [
        {
          name: "sb-auth-token",
          value: "new-token",
          options: { httpOnly: true },
        },
      ],
      REQUIRED_RESPONSE_HEADERS,
    );

    expect(cookieStore.set).toHaveBeenCalledWith(
      "sb-auth-token",
      "new-token",
      { httpOnly: true },
    );
    expect(responseHeaders.get("cache-control")).toBe(
      REQUIRED_RESPONSE_HEADERS["Cache-Control"],
    );
    expect(responseHeaders.get("expires")).toBe(
      REQUIRED_RESPONSE_HEADERS.Expires,
    );
    expect(responseHeaders.get("pragma")).toBe(
      REQUIRED_RESPONSE_HEADERS.Pragma,
    );
  });
});
