// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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

import { MagicLinkForm } from "./page";

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
