// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

vi.mock("@/features/workspaces/actions", () => ({
  createWorkspaceFromForm: vi.fn(),
}));

import OnboardingPage from "./page";

it("renders workspace name and logo fields with a submission action", () => {
  render(<OnboardingPage />);

  expect(
    screen.getByRole("heading", {
      name: "Create your workspace.",
    }),
  ).toBeVisible();
  expect(
    screen.getByText("Add your workspace name and logo"),
  ).toBeVisible();

  const workspaceName = screen.getByRole("textbox", {
    name: /workspace name/i,
  });
  const workspaceLogo = screen.getByRole("button", {
    name: /workspace logo/i,
  });
  const createWorkspace = screen.getByRole("button", {
    name: "Create workspace",
  });

  expect(workspaceName).toBeVisible();
  expect(workspaceName.closest("[data-size]")).toHaveAttribute(
    "data-size",
    "lg",
  );
  expect(workspaceLogo).toBeVisible();
  expect(workspaceLogo).toHaveTextContent(
    "PNG, JPEG, or WebP up to 2 MB",
  );
  expect(
    screen.queryByRole("textbox", { name: /first product/i }),
  ).not.toBeInTheDocument();
  expect(createWorkspace).toBeVisible();
  expect(createWorkspace).toHaveAttribute("data-size", "lg");
});
