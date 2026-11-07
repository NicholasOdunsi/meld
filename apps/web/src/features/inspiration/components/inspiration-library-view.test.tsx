// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useInspirationLibrary: vi.fn(), listEditableRooms: vi.fn(async () => []) }));
vi.mock("../use-inspiration-library", () => ({ useInspirationLibrary: mocks.useInspirationLibrary }));
vi.mock("../inspiration-reader", () => ({ listEditableRooms: mocks.listEditableRooms }));

import { InspirationLibraryView } from "./inspiration-library-view";

afterEach(cleanup);

const WORKSPACE = "22222222-2222-4222-8222-222222222222";

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    hasMore: false,
    isLoadingMore: false,
    selectedIds: new Set<string>(),
    uploadingCount: 0,
    setSelected: vi.fn(),
    clearSelection: vi.fn(),
    loadMore: vi.fn(),
    uploadFiles: vi.fn(),
    deleteSelected: vi.fn(),
    deleteOne: vi.fn(),
    addSelectedToRoom: vi.fn(),
    saveNote: vi.fn(),
    ...overrides,
  };
}

describe("InspirationLibraryView", () => {
  it("shows the empty state with the shelf hint", () => {
    mocks.useInspirationLibrary.mockReturnValue(hookState());
    render(<InspirationLibraryView workspaceId={WORKSPACE} initialPage={{ items: [], hasMore: false }} initialOpenItemId={null} />);
    expect(screen.getByTestId("inspiration-empty")).toHaveTextContent(
      "Drag images onto the Orion icon in your menu bar, or drop them here.",
    );
  });

  it("shows the count and the grid when there are images", () => {
    mocks.useInspirationLibrary.mockReturnValue(
      hookState({
        items: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            workspaceId: WORKSPACE,
            imageUrl: "https://signed/a",
            width: 1,
            height: 1,
            mimeType: "image/png",
            sourceUrl: null,
            note: null,
            captureChannel: "web",
            createdAt: "2026-11-06T10:00:00.000Z",
            roomIds: [],
          },
        ],
      }),
    );
    render(<InspirationLibraryView workspaceId={WORKSPACE} initialPage={{ items: [], hasMore: false }} initialOpenItemId={null} />);
    expect(screen.getByTestId("inspiration-grid")).toBeInTheDocument();
    expect(screen.getByText("1 image")).toBeInTheDocument();
  });
});
