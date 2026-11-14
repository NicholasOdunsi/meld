// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("./room-board-actions", () => ({ readRoomExcalidrawBoard: mocks.read }));
vi.mock("next/dynamic", () => ({
  default: () => (props: { roomId?: string; initialBoard?: { elements: unknown[] }; initialRevision?: number }) =>
    <p data-testid="board">{props.roomId ?? "local"}:{props.initialRevision ?? "none"}:{props.initialBoard?.elements.length ?? "none"}</p>,
}));

import { BoardLoader } from "./board-loader";

const roomId = "40000000-0000-4000-8000-000000000004";

afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("BoardLoader", () => {
  it("loads a room board before mounting the editor", async () => {
    mocks.read.mockResolvedValue({ status: "ok", revision: 3, elements: [{ id: "r", type: "rectangle" }], screens: [] });
    render(<BoardLoader roomId={roomId} boardId={roomId} access="edit" />);
    expect(screen.getByText("Loading room canvas…")).toBeInTheDocument();
    expect(await screen.findByTestId("board")).toHaveTextContent(`${roomId}:3:1`);
    expect(mocks.read).toHaveBeenCalledWith(roomId);
  });

  it("shows an error and can retry a failed read", async () => {
    mocks.read.mockResolvedValueOnce({ status: "error" }).mockResolvedValueOnce({ status: "ok", revision: 0, elements: [], screens: [] });
    render(<BoardLoader roomId={roomId} access="view" />);
    expect(await screen.findByText("Could not load this room canvas.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("board")).toHaveTextContent(`${roomId}:0:0`));
  });

  it("keeps the dev board local", () => {
    render(<BoardLoader access="edit" />);
    expect(screen.getByTestId("board")).toHaveTextContent("local:none:none");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
