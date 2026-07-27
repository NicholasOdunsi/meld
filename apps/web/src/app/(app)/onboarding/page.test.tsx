// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/features/workspaces/actions", () => ({
  createOrganizationFromForm: vi.fn(),
}));

import OnboardingPage from "./page";

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
