// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

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

vi.mock("./actions", () => ({
  createOrganizationFromForm: vi.fn(),
}));

import OnboardingPage from "../../app/(app)/onboarding/page";

it("renders workspace and product fields with a submission action", () => {
  render(<OnboardingPage />);

  expect(
    screen.getByRole("heading", {
      name: "Create your Meld workspace",
    }),
  ).toBeVisible();
  expect(
    screen.getByRole("textbox", { name: /organization name/i }),
  ).toBeVisible();
  expect(
    screen.getByRole("textbox", { name: /first product/i }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Create workspace" }),
  ).toBeVisible();
});
