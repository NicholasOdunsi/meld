// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FAKE_TASTE_BOARD } from "../taste/taste-fake";
import { TasteBoard } from "./taste-board";

vi.mock("server-only", () => ({}));
afterEach(cleanup);

describe("TasteBoard", () => {
  it("renders every tile with its content", () => {
    render(<TasteBoard board={{ ...FAKE_TASTE_BOARD, avoid: [{ text: "gradients", source: "typed" }] }} onEdit={() => undefined} />);
    for (const heading of ["Design language", "Colour", "Typography", "Spacing", "Density", "Layout habits", "Signature details", "You avoid"]) {
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    }
    expect(screen.getByText("minimal · bold-type · airy")).toBeVisible();
    expect(screen.getByLabelText("#e2231a accent")).toBeVisible();
    expect(screen.getByText("gradients")).toBeVisible();
  });

  it("asks to edit a tile", async () => {
    const onEdit = vi.fn();
    render(<TasteBoard board={FAKE_TASTE_BOARD} onEdit={onEdit} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Density" }));
    expect(onEdit).toHaveBeenCalledWith("density");
  });
});
