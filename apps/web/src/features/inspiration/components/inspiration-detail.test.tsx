// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { InspirationItemView } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspirationDetail } from "./inspiration-detail";

afterEach(cleanup);

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ROOM = { roomId: "33333333-3333-4333-8333-333333333333", roomName: "Login", projectName: "App" };
const A: InspirationItemView = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: WORKSPACE,
  imageUrl: "https://signed/a",
  width: 1,
  height: 1,
  mimeType: "image/png",
  sourceUrl: "https://www.pinterest.com/pin/1/",
  note: "nav",
  captureChannel: "shelf",
  createdAt: "2026-11-06T10:00:00.000Z",
  roomIds: [ROOM.roomId],
};
const B: InspirationItemView = { ...A, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", note: null, sourceUrl: null, roomIds: [] };

function renderDetail(overrides: Partial<Parameters<typeof InspirationDetail>[0]> = {}) {
  const props = {
    workspaceId: WORKSPACE,
    items: [A, B],
    openItemId: A.id,
    rooms: [ROOM],
    onOpenItemChange: vi.fn(),
    onNoteSaved: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    ...overrides,
  };
  render(<InspirationDetail {...props} />);
  return props;
}

describe("InspirationDetail", () => {
  it("shows the source link and the rooms that use the image", () => {
    renderDetail();
    expect(screen.getByRole("link", { name: /pinterest\.com/ })).toHaveAttribute("href", "https://www.pinterest.com/pin/1/");
    expect(screen.getByRole("link", { name: "App › Login" })).toHaveAttribute(
      "href",
      `/${WORKSPACE}/rooms/${ROOM.roomId}?tab=inspiration`,
    );
  });

  it("saves the edited note", () => {
    const props = renderDetail();
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "better" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(props.onNoteSaved).toHaveBeenCalledWith(A.id, "better");
  });

  it("moves to the next image", () => {
    const props = renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(props.onOpenItemChange).toHaveBeenCalledWith(B.id);
  });

  it("asks before deleting", () => {
    const props = renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Delete image" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith(A.id);
  });
});
