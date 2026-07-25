// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("../actions", () => ({
  acknowledgeMention: vi.fn(),
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
