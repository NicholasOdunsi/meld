// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  requestMagicLink: vi.fn(),
  signInWithGoogle: vi.fn(),
  verifyEmailCode: vi.fn(),
}));

vi.mock("react-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-dom")>()),
  useFormStatus: () => ({ pending: false }),
}));

vi.mock("@/features/auth/actions", () => actionMocks);

import SignInPage, { MagicLinkForm } from "./page";

afterEach(cleanup);

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

describe("MagicLinkForm code step", () => {
  it("asks for the 6-digit code once the email is sent", () => {
    render(
      <MagicLinkForm state={{ status: "success", message: "sent" }} action={vi.fn()} nextPath="/" />,
    );
    expect(screen.getByLabelText("6-digit code")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("does not show the code field before the email is sent", () => {
    render(<MagicLinkForm state={{ status: "idle" }} action={vi.fn()} nextPath="/" />);
    expect(screen.queryByLabelText("6-digit code")).not.toBeInTheDocument();
  });
});

describe("SignInPage inside the Orion Mac app", () => {
  it("hides Continue with Google", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 OrionMac/1.0.3");
    await act(async () => {
      render(<SignInPage searchParams={Promise.resolve({})} />);
    });
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
