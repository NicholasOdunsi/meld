// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { InspirationItemView } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspirationGrid } from "./inspiration-grid";

afterEach(cleanup);

function item(id: string): InspirationItemView {
  return {
    id,
    workspaceId: "22222222-2222-4222-8222-222222222222",
    imageUrl: `https://signed/${id}`,
    width: 1,
    height: 1,
    mimeType: "image/png",
    sourceUrl: null,
    note: null,
    captureChannel: "web",
    createdAt: "2026-11-06T10:00:00.000Z",
    roomIds: [],
  };
}

describe("InspirationGrid", () => {
  it("renders one tile per item plus uploading placeholders first", () => {
    render(
      <InspirationGrid
        items={[item("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), item("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")]}
        selectedIds={new Set()}
        onSelectedChange={vi.fn()}
        onOpen={vi.fn()}
        uploadingCount={2}
      />,
    );
    expect(screen.getAllByTestId("inspiration-tile")).toHaveLength(2);
    expect(screen.getAllByTestId("inspiration-uploading")).toHaveLength(2);
  });
});
