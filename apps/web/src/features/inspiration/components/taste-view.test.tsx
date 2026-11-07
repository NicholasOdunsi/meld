// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  addTasteDislike: vi.fn(async () => ({ status: "saved", version: 2 })),
  saveTasteTile: vi.fn(async () => ({ status: "saved", version: 2 })),
  getTasteView: vi.fn(),
  decideTasteSuggestion: vi.fn(),
}));
vi.mock("../taste/taste-actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/ws/inspiration" }));

import { FAKE_TASTE_BOARD } from "../taste/taste-fake";
import { TasteView } from "./taste-view";

afterEach(cleanup);
const WS = "00000000-0000-4000-8000-000000000001";

describe("TasteView", () => {
  it("shows the learning state with how many more images are needed", () => {
    render(<TasteView workspaceId={WS} initialView={{ status: "learning", sortedCount: 5, needed: 8 }} />);
    expect(screen.getByText("Save 3 more images and Orion will draw your taste.")).toBeVisible();
  });

  it("shows that taste learning is off without a key", () => {
    render(<TasteView workspaceId={WS} initialView={{ status: "off" }} />);
    expect(screen.getByText("Taste learning is off")).toBeVisible();
  });

  it("adds a typed dislike", async () => {
    render(<TasteView workspaceId={WS} initialView={{ status: "ready", board: FAKE_TASTE_BOARD, version: 1, pending: [] }} />);
    await userEvent.type(screen.getByLabelText("Add a dislike"), "gradients");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(actions.addTasteDislike).toHaveBeenCalledWith({ workspaceId: WS, text: "gradients", expectedVersion: 1 });
  });
});
