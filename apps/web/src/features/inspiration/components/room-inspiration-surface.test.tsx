// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: vi.fn(),
  unlinkInspirationFromRoom: vi.fn(),
  linkInspirationToRoom: vi.fn(),
  updateInspirationNote: vi.fn(),
  deleteInspirationItems: vi.fn(),
  listEditableRooms: vi.fn(async () => []),
  listLibrary: vi.fn(async () => ({ items: [], hasMore: false })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("../inspiration-actions", () => ({
  unlinkInspirationFromRoom: mocks.unlinkInspirationFromRoom,
  linkInspirationToRoom: mocks.linkInspirationToRoom,
  updateInspirationNote: mocks.updateInspirationNote,
  deleteInspirationItems: mocks.deleteInspirationItems,
}));
vi.mock("../inspiration-reader", () => ({ listEditableRooms: mocks.listEditableRooms, listLibrary: mocks.listLibrary }));

import { RoomInspirationSurface } from "./room-inspiration-surface";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ROOM = "33333333-3333-4333-8333-333333333333";
const A = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: WORKSPACE,
  imageUrl: "https://signed/a",
  width: 1,
  height: 1,
  mimeType: "image/png" as const,
  sourceUrl: null,
  note: null,
  captureChannel: "web" as const,
  createdAt: "2026-11-06T10:00:00.000Z",
  roomIds: [ROOM],
};

describe("RoomInspirationSurface", () => {
  it("removes selected images from the room only, then refreshes", async () => {
    mocks.unlinkInspirationFromRoom.mockResolvedValue({ status: "unlinked", count: 1 });
    render(<RoomInspirationSurface workspaceId={WORKSPACE} roomId={ROOM} items={[A]} canEdit />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select image" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from room" }));
    await waitFor(() => expect(mocks.unlinkInspirationFromRoom).toHaveBeenCalledWith({ roomId: ROOM, itemIds: [A.id] }));
    expect(mocks.deleteInspirationItems).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("hides editing controls from view-only participants", () => {
    render(<RoomInspirationSurface workspaceId={WORKSPACE} roomId={ROOM} items={[A]} canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Add from library" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select image" })).not.toBeInTheDocument();
  });
});
