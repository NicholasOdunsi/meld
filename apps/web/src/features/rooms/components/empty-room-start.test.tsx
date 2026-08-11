// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  startUserFlow: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@astryxdesign/core/Toast", () => ({
  useToast: () => mocks.toast,
}));
vi.mock("@/features/canvas/user-flow-lifecycle", () => ({
  startUserFlow: mocks.startUserFlow,
}));

import { EmptyRoomStart } from "./empty-room-start";

const roomId = "40000000-0000-4000-8000-000000000004";
const basePath = `/30000000-0000-4000-8000-000000000003/rooms/${roomId}`;

function renderActions(canEdit = true) {
  return render(
    <main>
      <textarea aria-label="Message" />
      <input type="file" aria-label="Add files or images" hidden />
      <EmptyRoomStart roomId={roomId} basePath={basePath} canEdit={canEdit} />
    </main>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.startUserFlow.mockResolvedValue({
    roomId,
    createdBy: "10000000-0000-4000-8000-000000000001",
    createdAt: "2026-08-11T12:00:00.000Z",
  });
});

afterEach(cleanup);

describe("EmptyRoomStart", () => {
  it("offers all three creation actions to editors", () => {
    renderActions();
    expect(screen.getByText("Paste meeting notes")).toBeInTheDocument();
    expect(screen.getByText("Start a user flow")).toBeInTheDocument();
    expect(screen.getByText("Just start talking")).toBeInTheDocument();
  });

  it("hides creation actions from view-only participants", () => {
    renderActions(false);
    expect(screen.queryByText("Paste meeting notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Start a user flow")).not.toBeInTheDocument();
    expect(screen.queryByText("Just start talking")).not.toBeInTheDocument();
  });

  it("opens the attachment path and focuses the composer for meeting notes", async () => {
    const user = userEvent.setup();
    renderActions();
    const fileInput = screen.getByLabelText("Add files or images", {
      selector: "input",
    });
    const click = vi.spyOn(fileInput, "click");

    await user.click(screen.getByText("Paste meeting notes"));

    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
  });

  it("focuses the composer when the user starts talking", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByText("Just start talking"));

    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();
  });

  it("persists lifecycle metadata before selecting the User Flows surface", async () => {
    const user = userEvent.setup();
    let resolveStart!: () => void;
    mocks.startUserFlow.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = () => resolve({
          roomId,
          createdBy: "10000000-0000-4000-8000-000000000001",
          createdAt: "2026-08-11T12:00:00.000Z",
        });
      }),
    );
    renderActions();

    await user.click(screen.getByText("Start a user flow"));
    expect(mocks.startUserFlow).toHaveBeenCalledWith(roomId);
    expect(mocks.push).not.toHaveBeenCalled();

    resolveStart();
    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledWith(`${basePath}?tab=user-flows`);
    });
  });

  it("stays on Conversation and shows an error when lifecycle persistence fails", async () => {
    const user = userEvent.setup();
    mocks.startUserFlow.mockRejectedValue(new Error("database details"));
    renderActions();

    await user.click(screen.getByText("Start a user flow"));

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith({
        type: "error",
        body: "We could not start that user flow.",
      });
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
