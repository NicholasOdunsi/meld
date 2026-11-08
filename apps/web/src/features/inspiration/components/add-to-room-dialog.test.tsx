// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddToRoomDialog } from "./add-to-room-dialog";

afterEach(cleanup);

const ROOMS = [
  { roomId: "33333333-3333-4333-8333-333333333333", roomName: "Login", projectName: "App" },
  { roomId: "44444444-4444-4444-8444-444444444444", roomName: "Pricing", projectName: "Site" },
];

describe("AddToRoomDialog", () => {
  it("confirms with the first room preselected", () => {
    const onConfirm = vi.fn();
    render(<AddToRoomDialog isOpen count={2} rooms={ROOMS} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Add 2 images" }));
    expect(onConfirm).toHaveBeenCalledWith(ROOMS[0]);
  });

  it("explains when there are no rooms to add to", () => {
    render(<AddToRoomDialog isOpen count={1} rooms={[]} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText("You don't have any rooms you can edit yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 1 image" })).toBeDisabled();
  });
});
