// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  createRoomFromUploads: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/features/discovery/actions", () => ({
  createDiscoveryRoomFromForm: vi.fn(),
  createRoomFromUploads: mocks.createRoomFromUploads,
}));

import { StartingPoints } from "./starting-points";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  cleanup();
  mocks.push.mockClear();
  mocks.refresh.mockClear();
  mocks.createRoomFromUploads.mockReset();
});

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
});

it("offers exactly two starting points", () => {
  render(<StartingPoints organizationId={ORGANIZATION_ID} />);

  expect(
    screen.getByRole("button", { name: "Start a Discovery Room" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Import project" }),
  ).toBeInTheDocument();
});

// Deleting the compact HStack (starting-points.tsx:29-43) leaves the cards
// branch untouched, so every other test in this file keeps passing -- this
// is the only test that would catch that regression, since the compact
// variant is how the weighting is meant to work on the smaller layout.
it("offers the same two starting points in the compact variant", () => {
  render(
    <StartingPoints organizationId={ORGANIZATION_ID} isCompact />,
  );

  expect(
    screen.getByRole("button", { name: "New room" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Import" }),
  ).toBeInTheDocument();
});

it("opens the create-room dialog from the compact New room action", async () => {
  const user = userEvent.setup();
  render(
    <StartingPoints organizationId={ORGANIZATION_ID} isCompact />,
  );

  await user.click(screen.getByRole("button", { name: "New room" }));

  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

it("opens the system file picker directly, with no dialog, from Import project", async () => {
  const user = userEvent.setup();
  const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
  render(<StartingPoints organizationId={ORGANIZATION_ID} />);

  await user.click(
    screen.getByRole("button", { name: "Import project" }),
  );

  expect(clickSpy).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  clickSpy.mockRestore();
});

it("opens the system file picker directly from the compact Import action", async () => {
  const user = userEvent.setup();
  const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click");
  render(
    <StartingPoints organizationId={ORGANIZATION_ID} isCompact />,
  );

  await user.click(screen.getByRole("button", { name: "Import" }));

  expect(clickSpy).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  clickSpy.mockRestore();
});

it("shows a loading overlay while importing and navigates to the new room on success", async () => {
  const user = userEvent.setup();
  const upload = deferred<{ roomId: string; failedFileNames: string[] }>();
  mocks.createRoomFromUploads.mockReturnValue(upload.promise);

  render(<StartingPoints organizationId={ORGANIZATION_ID} />);
  const file = new File(["notes"], "notes.txt", { type: "text/plain" });

  await user.upload(screen.getByTestId("import-file-input"), file);

  expect(
    await screen.findByText("Importing your files…"),
  ).toBeInTheDocument();

  upload.resolve({
    roomId: "40000000-0000-4000-8000-000000000004",
    failedFileNames: [],
  });

  await waitFor(() => {
    expect(
      screen.queryByText("Importing your files…"),
    ).not.toBeInTheDocument();
  });
  expect(mocks.push).toHaveBeenCalledWith(
    `/${ORGANIZATION_ID}/discovery/40000000-0000-4000-8000-000000000004`,
  );
});

it("shows an info toast but still navigates when some files fail to attach", async () => {
  const user = userEvent.setup();
  mocks.createRoomFromUploads.mockResolvedValue({
    roomId: "40000000-0000-4000-8000-000000000004",
    failedFileNames: ["broken.pdf"],
  });

  render(<StartingPoints organizationId={ORGANIZATION_ID} />);
  const file = new File(["notes"], "notes.txt", { type: "text/plain" });

  await user.upload(screen.getByTestId("import-file-input"), file);

  expect(
    await screen.findByText(/did not attach: broken\.pdf/),
  ).toBeInTheDocument();
  expect(mocks.push).toHaveBeenCalledWith(
    `/${ORGANIZATION_ID}/discovery/40000000-0000-4000-8000-000000000004`,
  );
});

it("shows an error toast and does not navigate when the import fails outright", async () => {
  const user = userEvent.setup();
  mocks.createRoomFromUploads.mockRejectedValue(
    new Error("We could not create the room."),
  );

  render(<StartingPoints organizationId={ORGANIZATION_ID} />);
  const file = new File(["notes"], "notes.txt", { type: "text/plain" });

  await user.upload(screen.getByTestId("import-file-input"), file);

  expect(
    await screen.findByText("We could not create the room."),
  ).toBeInTheDocument();
  expect(mocks.push).not.toHaveBeenCalled();
  expect(
    screen.queryByText("Importing your files…"),
  ).not.toBeInTheDocument();
});
