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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("./actions", () => ({
  inviteMemberFromForm: vi.fn(),
  retryInvitationDeliveryFromForm: vi.fn(),
}));

import { InviteOnboarding } from "./invite-onboarding";

it("renders the member invitation onboarding step", () => {
  render(
    <InviteOnboarding
      organizationId="30000000-0000-4000-8000-000000000003"
      members={[
        {
          email: "owner@example.com",
          role: "Admin",
        },
      ]}
      invitations={[
        {
          email: "invitee@example.com",
          role: "Product designer",
        },
      ]}
    />,
  );

  expect(
    screen.getByRole("heading", { name: "Invite your team." }),
  ).toBeVisible();
  expect(screen.getByText("People with access")).toBeVisible();
  expect(screen.getByText("Invited people")).toBeVisible();
  expect(screen.getByText("owner@example.com")).toBeVisible();
  expect(screen.getByText("invitee@example.com")).toBeVisible();
  expect(
    screen.getByText("invitee@example.com").closest("li"),
  ).toHaveTextContent("Product designer");
  expect(
    screen.getByRole("combobox", { name: "Role" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Send invite" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Skip for now" }),
  ).toBeVisible();
});
