// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listLibrary: vi.fn() }));
vi.mock("../inspiration-reader", () => ({ listLibrary: mocks.listLibrary }));

import { LibraryPickerDialog } from "./library-picker-dialog";

afterEach(cleanup);

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function item(id: string) {
  return {
    id,
    workspaceId: WORKSPACE,
    imageUrl: `https://signed/${id}`,
    width: 1,
    height: 1,
    mimeType: "image/png" as const,
    sourceUrl: null,
    note: null,
    captureChannel: "web" as const,
    createdAt: "2026-11-06T10:00:00.000Z",
    roomIds: [],
  };
}

describe("LibraryPickerDialog", () => {
  it("lists library images not already in the room and confirms the picked ones", async () => {
    mocks.listLibrary.mockResolvedValue({ items: [item(A), item(B)], hasMore: false });
    const onConfirm = vi.fn();
    render(<LibraryPickerDialog isOpen workspaceId={WORKSPACE} excludeIds={[B]} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    await waitFor(() => expect(screen.getAllByTestId("inspiration-tile")).toHaveLength(1));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select image" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1 image" }));
    expect(onConfirm).toHaveBeenCalledWith([A]);
  });
});
