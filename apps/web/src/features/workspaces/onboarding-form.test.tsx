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

it("renders organization name and logo fields with a submission action", () => {
  render(<OnboardingPage />);

  expect(
    screen.getByRole("heading", {
      name: "Create your organization.",
    }),
  ).toBeVisible();
  expect(
    screen.getByText("Add your organization name and logo"),
  ).toBeVisible();

  const organizationName = screen.getByRole("textbox", {
    name: /organization name/i,
  });
  const organizationLogo = screen.getByRole("button", {
    name: /organization logo/i,
  });
  const createWorkspace = screen.getByRole("button", {
    name: "Create workspace",
  });

  expect(organizationName).toBeVisible();
  expect(organizationName.closest("[data-size]")).toHaveAttribute(
    "data-size",
    "lg",
  );
  expect(organizationLogo).toBeVisible();
  expect(organizationLogo).toHaveTextContent(
    "PNG, JPEG, or WebP up to 2 MB",
  );
  expect(
    screen.queryByRole("textbox", { name: /first product/i }),
  ).not.toBeInTheDocument();
  expect(createWorkspace).toBeVisible();
  expect(createWorkspace).toHaveAttribute("data-size", "lg");
});
