// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AttentionItem } from "../attention/types";

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

vi.stubGlobal(
  "ResizeObserver",
  vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
);

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  acknowledgeMention: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../actions", () => ({
  acknowledgeMention: mocks.acknowledgeMention,
}));

import { NeedsAttention } from "./needs-attention";

const ITEM: AttentionItem = {
  id: "50000000-0000-4000-8000-000000000005",
  kind: "mention",
  title: "You were mentioned in Checkout",
  roomId: "40000000-0000-4000-8000-000000000004",
  roomName: "Checkout",
  occurredAt: "2026-07-20T10:00:00.000Z",
  href: "/org/discovery/room",
};

const SECOND_ITEM: AttentionItem = {
  id: "50000000-0000-4000-8000-000000000006",
  kind: "mention",
  title: "You were mentioned in Pricing",
  roomId: "40000000-0000-4000-8000-000000000007",
  roomName: "Pricing",
  occurredAt: "2026-07-21T10:00:00.000Z",
  href: "/org/discovery/other-room",
};

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.acknowledgeMention.mockReset();
});

afterEach(cleanup);

it("lists each item with a link to its room", () => {
  render(<NeedsAttention items={[ITEM]} />);

  expect(
    screen.getByText("You were mentioned in Checkout"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", {
      name: /You were mentioned in Checkout/,
    }),
  ).toHaveAttribute("href", "/org/discovery/room");
});

it("tells the user when nothing needs them", () => {
  render(<NeedsAttention items={[]} />);

  expect(screen.getByText("You're all caught up")).toBeInTheDocument();
});

it("offers to dismiss a mention", () => {
  render(<NeedsAttention items={[ITEM]} />);

  expect(
    screen.getByRole("button", { name: "Dismiss" }),
  ).toBeInTheDocument();
});

it("disables only the row being dismissed, not every row", async () => {
  const user = userEvent.setup();
  // Never resolves during the assertion window, so both buttons' pending
  // state is observable before the transition settles.
  mocks.acknowledgeMention.mockImplementation(
    () => new Promise(() => {}),
  );

  render(<NeedsAttention items={[ITEM, SECOND_ITEM]} />);

  const [firstDismiss, secondDismiss] = screen.getAllByRole("button", {
    name: "Dismiss",
  });
  await user.click(firstDismiss);

  await waitFor(() => {
    expect(firstDismiss).toBeDisabled();
  });
  expect(secondDismiss).not.toBeDisabled();
});

it("keeps the list mounted and shows a failure message when dismiss fails", async () => {
  const user = userEvent.setup();
  mocks.acknowledgeMention.mockRejectedValueOnce(
    new Error("network down"),
  );

  render(<NeedsAttention items={[ITEM]} />);

  await user.click(screen.getByRole("button", { name: "Dismiss" }));

  expect(
    await screen.findByText(
      "We could not dismiss that mention. Try again.",
    ),
  ).toBeInTheDocument();
  // The list -- not an error-boundary replacement -- is still rendered.
  expect(
    screen.getByText("You were mentioned in Checkout"),
  ).toBeInTheDocument();
  expect(mocks.refresh).not.toHaveBeenCalled();
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Dismiss" })).not.toBeDisabled();
  });
});
