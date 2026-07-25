// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending: false }),
}));

vi.mock("@/features/auth/actions", () => ({
  requestMagicLink: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

import SignInPage, { MagicLinkForm } from "./page";

describe("MagicLinkForm", () => {
  it("disables further submissions after a sign-in link is sent", () => {
    render(
      <MagicLinkForm
        state={{
          status: "success",
          message: "Check your email for a secure sign-in link.",
        }}
        action={vi.fn()}
        nextPath="/onboarding"
      />,
    );

    expect(
      screen.getByRole("textbox", { name: /email address/i }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByRole("button", { name: "Sign-in link sent" }),
    ).toBeDisabled();
  });
});

describe("SignInPage", () => {
  it("presents email-link and Google sign-in in the frameless layout", async () => {
    let view: ReturnType<typeof render>;

    await act(async () => {
      view = render(<SignInPage searchParams={Promise.resolve({})} />);
    });
    const page = within(view!.container);

    expect(
      await page.findByRole("heading", { name: "Welcome back" }),
    ).toBeInTheDocument();
    expect(
      page.getByRole("textbox", { name: "Email address" }),
    ).toBeInTheDocument();
    expect(
      page.getByRole("button", { name: "Send magic link" }),
    ).toBeInTheDocument();
    expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
  });
});
