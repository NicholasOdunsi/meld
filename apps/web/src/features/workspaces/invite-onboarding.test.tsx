// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mocks.push,
    refresh: vi.fn(),
  }),
}));

vi.mock("./actions", () => ({
  inviteMemberFromForm: vi.fn(),
  retryInvitationDeliveryFromForm: vi.fn(),
}));

import { InviteOnboarding } from "./invite-onboarding";

beforeEach(() => {
  mocks.push.mockClear();
});

it("renders the member invitation onboarding step", () => {
  const organizationId =
    "30000000-0000-4000-8000-000000000003";

  render(
    <InviteOnboarding
      organizationId={organizationId}
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
  expect(
    screen.getByRole("button", { name: "Done" }),
  ).toBeVisible();

  fireEvent.click(
    screen.getByRole("button", { name: "Skip for now" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Done" }));

  expect(mocks.push).toHaveBeenNthCalledWith(
    1,
    `/onboarding/${organizationId}/ai`,
  );
  expect(mocks.push).toHaveBeenNthCalledWith(
    2,
    `/onboarding/${organizationId}/ai`,
  );
});
