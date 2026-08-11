// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoomStageSelector } from "./room-stage-selector";

const mocks = vi.hoisted(() => ({
  setRoomStage: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("../actions", () => ({ setRoomStage: mocks.setRoomStage }));
vi.mock("@astryxdesign/core/Toast", () => ({
  useToast: () => mocks.toast,
}));

const ROOM_ID = "40000000-0000-4000-8000-000000000004";

beforeEach(() => {
  mocks.setRoomStage.mockReset();
  mocks.toast.mockReset();
});
afterEach(cleanup);

it("renders only for authorized users", () => {
  const { rerender } = render(
    <RoomStageSelector
      roomId={ROOM_ID}
      stage="discovery"
      canChangeStage={false}
    />,
  );
  expect(screen.queryByRole("combobox", { name: "Room stage" })).toBeNull();

  rerender(
    <RoomStageSelector
      roomId={ROOM_ID}
      stage="discovery"
      canChangeStage
    />,
  );
  expect(screen.getByRole("combobox", { name: "Room stage" })).toHaveTextContent(
    "Discovery",
  );
});

it("optimistically selects and then keeps the committed RPC value", async () => {
  const user = userEvent.setup();
  let resolveStage: (stage: "design") => void = () => undefined;
  mocks.setRoomStage.mockReturnValue(
    new Promise<"design">((resolve) => {
      resolveStage = resolve;
    }),
  );
  render(
    <RoomStageSelector roomId={ROOM_ID} stage="discovery" canChangeStage />,
  );

  await user.click(screen.getByRole("combobox", { name: "Room stage" }));
  await user.click(screen.getByRole("option", { name: "Design" }));
  expect(screen.getByRole("combobox", { name: "Room stage" })).toHaveTextContent(
    "Design",
  );
  resolveStage("design");
  await waitFor(() => {
    expect(mocks.setRoomStage).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      stage: "design",
    });
  });
});

it("restores the prior value and announces a failed mutation", async () => {
  const user = userEvent.setup();
  mocks.setRoomStage.mockRejectedValue(new Error("offline"));
  render(
    <RoomStageSelector roomId={ROOM_ID} stage="define" canChangeStage />,
  );

  await user.click(screen.getByRole("combobox", { name: "Room stage" }));
  await user.click(screen.getByRole("option", { name: "Development" }));

  await waitFor(() => {
    expect(screen.getByRole("combobox", { name: "Room stage" })).toHaveTextContent(
      "Define",
    );
  });
  expect(mocks.toast).toHaveBeenCalledWith({
    type: "error",
    body: "Could not change the room stage.",
    uniqueID: `room-stage:${ROOM_ID}`,
  });
});
