// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

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
  listRoomInviteCandidates: vi.fn().mockResolvedValue([]),
  createRoomWithParticipants: vi.fn(),
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
