import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  noStore: vi.fn(),
  redirect: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
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
      message: "Check your email for a secure sign-in link.",
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
