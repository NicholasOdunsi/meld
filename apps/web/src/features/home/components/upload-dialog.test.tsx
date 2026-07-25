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
  createRoomFromUploads: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/features/discovery/actions", () => ({
  createRoomFromUploads: mocks.createRoomFromUploads,
}));

import { UploadDialog } from "./upload-dialog";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";
const FIRST_ROOM_ID = "40000000-0000-4000-8000-000000000004";
const SECOND_ROOM_ID = "50000000-0000-4000-8000-000000000005";

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
  mocks.createRoomFromUploads.mockReset();
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
      <UploadDialog
        organizationId={ORGANIZATION_ID}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
      />
    </>
  );
}

function fileInputElement() {
  const input = document
    .querySelector("dialog")
    ?.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("file input not found");
  return input;
}

it("starts a fresh upload after a partial failure is closed and reopened", async () => {
  const user = userEvent.setup();
  mocks.createRoomFromUploads.mockResolvedValueOnce({
    roomId: FIRST_ROOM_ID,
    failedFileNames: ["broken.txt"],
  });

  render(<Harness />);

  await user.upload(
    fileInputElement(),
    new File(["brief"], "checkout-brief.md", { type: "text/markdown" }),
  );
  await user.click(screen.getByRole("button", { name: "Create room" }));

  // Partial failure keeps the user in the dialog with a way into the room.
  expect(
    await screen.findByRole("button", { name: "Go to room" }),
  ).toBeInTheDocument();
  expect(mocks.push).not.toHaveBeenCalled();

  // Close without clicking "Go to room", then reopen.
  await user.click(screen.getByRole("button", { name: /close/i }));
  await user.click(screen.getByRole("button", { name: "reopen" }));

  // The reopened dialog must be fresh: no stale room, no stale selection.
  // Scope to the dialog: Astryx's polite live region still holds the
  // earlier "1 file selected" announcement, which is not displayed state.
  const dialog = screen.getByRole("dialog");
  expect(
    within(dialog).getByRole("button", { name: "Create room" }),
  ).toBeInTheDocument();
  const fileTrigger = within(dialog).getByRole("button", {
    name: "Files",
  });
  expect(fileTrigger).toHaveTextContent("Choose files");
  expect(fileTrigger).not.toHaveTextContent("checkout-brief.md");
  expect(
    within(dialog).queryByText(/did not attach/i),
  ).not.toBeInTheDocument();

  // A new selection must create a new room, not navigate to the old one.
  mocks.createRoomFromUploads.mockResolvedValueOnce({
    roomId: SECOND_ROOM_ID,
    failedFileNames: [],
  });
  await user.upload(
    fileInputElement(),
    new File(["notes"], "pricing-notes.md", { type: "text/markdown" }),
  );
  await user.click(screen.getByRole("button", { name: "Create room" }));

  expect(mocks.createRoomFromUploads).toHaveBeenCalledTimes(2);
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
    `/${ORGANIZATION_ID}/discovery/${SECOND_ROOM_ID}`,
  );
});
