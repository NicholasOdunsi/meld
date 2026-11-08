// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FAKE_TASTE_BOARD } from "../taste/taste-fake";
import { TasteTileEditor } from "./taste-tile-editor";

vi.mock("server-only", () => ({}));
afterEach(cleanup);

describe("TasteTileEditor", () => {
  it("edits a list tile one item per line", async () => {
    const onSave = vi.fn();
    render(<TasteTileEditor tile="layoutHabits" board={FAKE_TASTE_BOARD} isOpen onOpenChange={() => undefined} onSave={onSave} />);
    const field = screen.getByLabelText("Layout habits (one per line)");
    await userEvent.clear(field);
    await userEvent.type(field, "Split screens on web{enter}Card stacks on mobile");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith(["Split screens on web", "Card stacks on mobile"]);
  });

  it("edits colours as 'hex role' lines", async () => {
    const onSave = vi.fn();
    render(<TasteTileEditor tile="colors" board={FAKE_TASTE_BOARD} isOpen onOpenChange={() => undefined} onSave={onSave} />);
    const field = screen.getByLabelText("Colour (one per line: #hex role)");
    await userEvent.clear(field);
    await userEvent.type(field, "#ffffff base{enter}#ff6b57 accent");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith([{ hex: "#ffffff", role: "base" }, { hex: "#ff6b57", role: "accent" }]);
  });
});
