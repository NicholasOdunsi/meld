import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  noStore: vi.fn(),
  redirect: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("next/cache", () => ({
  unstable_noStore: mocks.noStore,
}));

import {
  requestMagicLink,
  signInWithGoogle,
  verifyEmailCode,
} from "./actions";

const INITIAL_AUTH_ACTION_STATE = {
  status: "idle",
} as const;

describe("authentication actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithOAuth: mocks.signInWithOAuth,
        signInWithOtp: mocks.signInWithOtp,
        verifyOtp: mocks.verifyOtp,
      },
    });
  });

  it.each([
    "https://evil.example/products",
    "//evil.example/products",
    "/\\evil.example/products",
    "products",
  ])("rejects unsafe redirect path %s", async (candidate) => {
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("next", candidate);

    await requestMagicLink(INITIAL_AUTH_ACTION_STATE, formData);

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "person@example.com",
      options: {
        emailRedirectTo: "http://localhost:3000/auth/callback?next=%2F",
      },
    });
  });

  it("rejects an invalid email before calling Supabase", async () => {
    const formData = new FormData();
    formData.set("email", "not-an-email");

    await expect(
      requestMagicLink(INITIAL_AUTH_ACTION_STATE, formData),
    ).resolves.toEqual({
      status: "error",
      message: "Enter a valid email address.",
      fieldErrors: { email: "Enter a valid email address." },
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requests a magic link with a same-origin callback", async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: null });
    const formData = new FormData();
    formData.set("email", "person@example.com");
    formData.set("next", "/products?status=active");

    await expect(
      requestMagicLink(INITIAL_AUTH_ACTION_STATE, formData),
    ).resolves.toEqual({
      status: "success",
      message: "Check your email for a sign-in link and code.",
    });
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      email: "person@example.com",
      options: {
        emailRedirectTo:
          "http://localhost:3000/auth/callback?next=%2Fproducts%3Fstatus%3Dactive",
      },
    });
    expect(mocks.noStore).toHaveBeenCalledOnce();
    expect(mocks.createClient).toHaveBeenCalledWith(expect.any(Headers));
  });

  it("returns a stable message when the magic-link provider fails", async () => {
    mocks.signInWithOtp.mockResolvedValue({
      error: new Error("provider details"),
    });
    const formData = new FormData();
    formData.set("email", "person@example.com");

    await expect(
      requestMagicLink(INITIAL_AUTH_ACTION_STATE, formData),
    ).resolves.toEqual({
      status: "error",
      message: "We could not send a sign-in link. Please try again.",
    });
  });

  it("starts Google PKCE with a safe callback then redirects", async () => {
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth" },
      error: null,
    });
    const formData = new FormData();
    formData.set("next", "https://evil.example");

    await signInWithGoogle(INITIAL_AUTH_ACTION_STATE, formData);

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/auth/callback?next=%2F",
      },
    });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "https://accounts.google.com/o/oauth2/auth",
    );
    expect(mocks.noStore).toHaveBeenCalledOnce();
    expect(mocks.createClient).toHaveBeenCalledWith(expect.any(Headers));
  });
});

describe("verifyEmailCode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    mocks.createClient.mockResolvedValue({
      auth: { verifyOtp: mocks.verifyOtp },
    });
  });

  function form(fields: Record<string, string>) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.set(key, value);
    return data;
  }

  it("signs in with a valid code and redirects to a safe next path", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    await verifyEmailCode(INITIAL_AUTH_ACTION_STATE, form({ email: " Person@Example.com ", code: "123456", next: "/abc" }));
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: "person@example.com", token: "123456", type: "email" });
    expect(mocks.redirect).toHaveBeenCalledWith("/abc");
  });

  it("falls back to / for an unsafe next path", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: null });
    await verifyEmailCode(INITIAL_AUTH_ACTION_STATE, form({ email: "person@example.com", code: "123456", next: "https://evil.example" }));
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it.each(["12345", "1234567", "abcdef", ""])("rejects malformed code %s without calling Supabase", async (code) => {
    const result = await verifyEmailCode(INITIAL_AUTH_ACTION_STATE, form({ email: "person@example.com", code }));
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(result).toEqual({ status: "error", message: "Enter the 6-digit code from the email." });
  });

  it("explains a wrong or expired code", async () => {
    mocks.verifyOtp.mockResolvedValue({ error: { message: "Token has expired or is invalid" } });
    const result = await verifyEmailCode(INITIAL_AUTH_ACTION_STATE, form({ email: "person@example.com", code: "654321" }));
    expect(result).toEqual({
      status: "error",
      message: "That code didn't work. Check the latest email or send a new one.",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
