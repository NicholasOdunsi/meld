// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

vi.stubGlobal(
  "ResizeObserver",
  vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
);

const mocks = vi.hoisted(() => ({
  createDiscoveryRoomFromForm: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/features/discovery/actions", () => ({
  createDiscoveryRoomFromForm: mocks.createDiscoveryRoomFromForm,
}));

import { CreateRoomDialog } from "./create-room-dialog";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";

// jsdom does not implement the native dialog methods Astryx's Dialog calls.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  });
  mocks.createDiscoveryRoomFromForm.mockReset();
  mocks.push.mockReset();
  mocks.refresh.mockReset();
});

afterEach(cleanup);

// Mirrors StartingPoints: the dialog stays mounted and only isOpen toggles,
// so component state survives a close.
function Harness() {
  const [isOpen, setIsOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        reopen
      </button>
      <CreateRoomDialog
        organizationId={ORGANIZATION_ID}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
    </>
  );
}

it("starts fresh after a failed submit is closed and reopened", async () => {
  const user = userEvent.setup();
  mocks.createDiscoveryRoomFromForm.mockResolvedValueOnce({
    status: "error",
    message: "That name is already taken.",
  });

  render(<Harness />);

  await user.type(
    screen.getByRole("textbox", { name: "Room name" }),
    "Customer interviews",
  );
  await user.click(screen.getByRole("button", { name: "Create room" }));

  expect(
    await screen.findByText("That name is already taken."),
  ).toBeInTheDocument();
  expect(mocks.push).not.toHaveBeenCalled();

  // Close without succeeding, then reopen.
  await user.click(screen.getByRole("button", { name: /close/i }));
  await user.click(screen.getByRole("button", { name: "reopen" }));

  // The reopened dialog must be fresh: no stale error, no stale room name.
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).queryByText("That name is already taken."),
  ).not.toBeInTheDocument();
  expect(
    within(dialog).getByRole("textbox", { name: "Room name" }),
  ).toHaveValue("");

  // A fresh submission must reach the action with the freshly typed name.
  mocks.createDiscoveryRoomFromForm.mockResolvedValueOnce({
    status: "success",
    roomId: "40000000-0000-4000-8000-000000000004",
  });
  await user.type(
    within(dialog).getByRole("textbox", { name: "Room name" }),
    "Pricing research",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Create room" }),
  );

  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
    `/${ORGANIZATION_ID}/discovery/40000000-0000-4000-8000-000000000004`,
  );
});
