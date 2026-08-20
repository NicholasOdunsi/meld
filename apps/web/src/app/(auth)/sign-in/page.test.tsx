// @vitest-environment jsdom

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  requestMagicLink: vi.fn(),
  // Still exported by `@/features/auth/actions` -- the server action was kept
  // when the Google button came off this screen, so the module mock has to
  // keep matching its shape.
  signInWithGoogle: vi.fn(),
}));

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

    // The Meld input is a native <input>, so it carries the real `disabled`
    // property rather than Astryx's `aria-disabled` reflection.
    expect(
      screen.getByRole("textbox", { name: /email address/i }),
    ).toBeDisabled();
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
  });

  it("offers the magic link as the only way in", async () => {
    let view: ReturnType<typeof render>;

    await act(async () => {
      view = render(<SignInPage searchParams={Promise.resolve({})} />);
    });
    const page = within(view!.container);

    expect(page.getAllByRole("button")).toHaveLength(1);
    expect(
      page.queryByRole("button", { name: /google/i }),
    ).not.toBeInTheDocument();
    expect(page.queryByText("or continue with")).not.toBeInTheDocument();
  });

  it("replaces the callback error with the latest magic-link feedback", async () => {
    const user = userEvent.setup();
    actionMocks.requestMagicLink.mockResolvedValue({
      status: "success",
      message: "Check your email for a secure sign-in link.",
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
  });

  it("surfaces a failed magic-link attempt as an error", async () => {
    const user = userEvent.setup();
    actionMocks.requestMagicLink.mockResolvedValue({
      status: "error",
      message: "We could not send that link. Please try again.",
    });
    let view: ReturnType<typeof render>;

    await act(async () => {
      view = render(<SignInPage searchParams={Promise.resolve({})} />);
    });
    const page = within(view!.container);

    await user.type(
      page.getByRole("textbox", { name: "Email address" }),
      "person@example.com",
    );
    await user.click(page.getByRole("button", { name: "Send magic link" }));

    expect(
      await page.findByText("We could not send that link. Please try again."),
    ).toBeInTheDocument();
  });
});
