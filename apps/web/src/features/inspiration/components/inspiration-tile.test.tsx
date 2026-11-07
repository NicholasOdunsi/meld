// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { InspirationItemView } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspirationTile } from "./inspiration-tile";

afterEach(cleanup);

const ITEM: InspirationItemView = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  imageUrl: "https://signed/a",
  width: 1,
  height: 1,
  mimeType: "image/png",
  sourceUrl: null,
  note: "love this nav",
  captureChannel: "shelf",
  createdAt: "2026-11-06T10:00:00.000Z",
  roomIds: [],
};

describe("InspirationTile", () => {
  it("shows the image with the note as alt text and opens on click", () => {
    const onOpen = vi.fn();
    render(<InspirationTile item={ITEM} isSelected={false} onSelectedChange={vi.fn()} onOpen={onOpen} />);
    expect(screen.getByRole("img", { name: "love this nav" })).toHaveAttribute("src", "https://signed/a");
    fireEvent.click(screen.getByRole("button", { name: "Open love this nav" }));
    expect(onOpen).toHaveBeenCalledWith(ITEM.id);
  });

  it("toggles selection from its checkbox", () => {
    const onSelectedChange = vi.fn();
    render(<InspirationTile item={ITEM} isSelected={false} onSelectedChange={onSelectedChange} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select image" }));
    expect(onSelectedChange).toHaveBeenCalledWith(ITEM.id, true);
  });

  it("has no checkbox when selection is hidden", () => {
    render(<InspirationTile item={ITEM} isSelected={false} onSelectedChange={vi.fn()} onOpen={vi.fn()} hideSelection />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
