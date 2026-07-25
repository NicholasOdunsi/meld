// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  requestMagicLink: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

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

vi.mock("@/features/auth/actions", () => actionMocks);

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
      await page.findByRole("heading", {
        name: "Your AI product workspace.",
      }),
    ).toBeInTheDocument();
    expect(
      page.getByText("Sign in to your Meld account"),
    ).toBeInTheDocument();
    expect(
      page
        .getByRole("textbox", { name: "Email address" })
        .closest("[data-size]"),
    ).toHaveAttribute("data-size", "lg");
    expect(
      page.getByRole("button", { name: "Send magic link" }),
    ).toHaveAttribute("data-size", "lg");
    expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toHaveAttribute("data-size", "lg");
  });

  it("shows only the latest sign-in feedback", async () => {
    const user = userEvent.setup();
    actionMocks.requestMagicLink.mockResolvedValue({
      status: "success",
      message: "Check your email for a secure sign-in link.",
    });
    actionMocks.signInWithGoogle.mockResolvedValue({
      status: "error",
      message: "Google sign-in is unavailable. Please try again.",
    });
    let view: ReturnType<typeof render>;

    await act(async () => {
      view = render(
        <SignInPage
          searchParams={Promise.resolve({ error: "callback" })}
        />,
      );
    });
    const page = within(view!.container);

    expect(
      page.getByText("We could not complete sign-in. Please try again."),
    ).toBeInTheDocument();

    await user.type(
      page.getByRole("textbox", { name: "Email address" }),
      "person@example.com",
    );
    await user.click(
      page.getByRole("button", { name: "Send magic link" }),
    );

    expect(
      await page.findByText(
        "Check your email for a secure sign-in link.",
      ),
    ).toBeInTheDocument();
    expect(
      page.queryByText(
        "We could not complete sign-in. Please try again.",
      ),
    ).not.toBeInTheDocument();

    await user.click(
      page.getByRole("button", { name: "Continue with Google" }),
    );

    expect(
      await page.findByText(
        "Google sign-in is unavailable. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(
      page.queryByText(
        "Check your email for a secure sign-in link.",
      ),
    ).not.toBeInTheDocument();
  });
});
