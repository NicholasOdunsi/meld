// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DiscoveryRoomHeader } from "./components/discovery-room-header";


afterEach(cleanup);

it("shows a compact room identity and opens the complete roster in a modal", async () => {
  const user = userEvent.setup();

  render(
    <DiscoveryRoomHeader
      roomName="Customer interviews"
      currentUserId="user-1"
      participants={[
        {
          userId: "user-1",
          email: "owner@example.com",
          access: "edit",
        },
        {
          userId: "user-2",
          email: "maya@example.com",
          access: "view",
        },
        {
          userId: "user-3",
          email: "sam@example.com",
          access: "view",
        },
      ]}
    />,
  );

  expect(
    screen.getByRole("heading", { name: "Customer interviews" }),
  ).toBeVisible();
  expect(screen.getByTestId("discovery-room-icon")).toBeVisible();
  expect(
    screen.queryByText(/Private to explicit room participants/i),
  ).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", {
    name: "5 room participants",
  });
  const visibleParticipants = within(
    screen.getByTestId("visible-room-participants"),
  );
  const visibleAvatars = visibleParticipants.getAllByRole("img");

  expect(visibleAvatars).toHaveLength(3);
  expect(visibleAvatars[0]).toHaveAccessibleName("owner@example.com");
  expect(visibleAvatars[1]).toHaveAccessibleName("Product Agent");
  expect(visibleAvatars[2]).toHaveAccessibleName("Research Agent");
  expect(
    visibleParticipants.getByTestId("room-participant-overflow"),
  ).toHaveAccessibleName("2 more");
  expect(visibleParticipants.getByText("+2")).toBeVisible();

  await user.click(trigger);

  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("heading", { name: "Members · 5" }),
  ).toBeVisible();
  expect(
    within(dialog).getByText(
      "People and agents in #customer-interviews",
    ),
  ).toBeVisible();
  expect(within(dialog).getByText("PEOPLE · 3")).toBeVisible();
  expect(within(dialog).getByText("AGENTS · 2")).toBeVisible();
  expect(
    within(dialog).getByRole("button", { name: "Invite" }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(
    within(dialog).getByRole("button", { name: "Add agent" }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(within(dialog).getByText("Product Agent")).toBeInTheDocument();
  expect(within(dialog).getByText("Research Agent")).toBeInTheDocument();
  expect(within(dialog).getByTestId("agent-members-list")).toHaveStyle({
    rowGap: "var(--spacing-2)",
  });
  expect(
    within(dialog).getByTestId("product-agent-avatar"),
  ).toHaveStyle({
    backgroundColor: "var(--color-icon-purple)",
    color: "var(--color-on-dark)",
  });
  expect(
    within(dialog)
      .getByTestId("product-agent-avatar")
      .querySelector("svg"),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByTestId("research-agent-avatar"),
  ).toHaveStyle({
    backgroundColor: "var(--color-icon-teal)",
    color: "var(--color-on-dark)",
  });
  expect(
    within(dialog)
      .getByTestId("research-agent-avatar")
      .querySelector("svg"),
  ).toBeInTheDocument();
  expect(
    within(dialog).queryByRole("img", {
      name: /agent illustration/i,
    }),
  ).not.toBeInTheDocument();
  expect(within(dialog).getByText("owner@example.com")).toBeInTheDocument();
  expect(within(dialog).getByText("maya@example.com")).toBeInTheDocument();
  expect(within(dialog).getByText("sam@example.com")).toBeInTheDocument();

  await user.click(
    within(dialog).getByRole("button", { name: "Close" }),
  );
  expect(dialog).not.toHaveAttribute("open");
});

it("truncates a long room label in the members modal", async () => {
  const user = userEvent.setup();

  render(
    <DiscoveryRoomHeader
      roomName="Odunsi Nicholas Najsnajsjqsaajdqjdabjabdjajansja"
      currentUserId="user-1"
      participants={[
        {
          userId: "user-1",
          email: "owner@example.com",
          access: "edit",
        },
      ]}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "3 room participants" }),
  );

  expect(
    within(screen.getByRole("dialog")).getByText(
      "People and agents in #odunsi-nicholas-najsnaj…",
    ),
  ).toBeVisible();
});
