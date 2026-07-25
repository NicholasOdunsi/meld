import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  createRoom: vi.fn(),
  storageFrom: vi.fn(),
  persistAttachmentUpload: vi.fn(),
  extractAttachmentText: vi.fn(),
  isDiscoveryFakeEnabled: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("./e2e-gate", () => ({
  isDiscoveryFakeEnabled: mocks.isDiscoveryFakeEnabled,
}));

vi.mock("./repository", () => ({
  createDiscoveryRepository: () => ({ createRoom: mocks.createRoom }),
}));

vi.mock("./upload-persistence", () => ({
  persistAttachmentUpload: mocks.persistAttachmentUpload,
}));

vi.mock("./attachment-extractor", () => ({
  extractAttachmentText: mocks.extractAttachmentText,
}));

import { createRoomFromUploads } from "./actions";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";
const ROOM_ID = "40000000-0000-4000-8000-000000000004";

function uploadsFormData(files: File[]) {
  const formData = new FormData();
  formData.set("organizationId", ORGANIZATION_ID);
  for (const file of files) {
    formData.append("files", file);
  }
  return formData;
}

function textFile(name: string) {
  return new File(["Users abandon at payment."], name, {
    type: "text/plain",
  });
}

describe("createRoomFromUploads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isDiscoveryFakeEnabled.mockReturnValue(false);
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        },
      },
      error: null,
    });
    mocks.storageFrom.mockReturnValue({ upload: vi.fn() });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      storage: { from: mocks.storageFrom },
    });
    mocks.createRoom.mockResolvedValue({ id: ROOM_ID });
    mocks.extractAttachmentText.mockResolvedValue("extracted text");
    mocks.persistAttachmentUpload.mockImplementation(
      async ({ attachment }) => ({
        id: attachment.id,
        original_name: attachment.fileName,
        extraction_status: attachment.extractionStatus,
      }),
    );
  });

  it("attaches every file and reports no failures on the happy path", async () => {
    const result = await createRoomFromUploads(
      uploadsFormData([
        textFile("checkout-brief.md"),
        textFile("notes.txt"),
      ]),
    );

    expect(result).toEqual({
      roomId: ROOM_ID,
      failedFileNames: [],
    });
    expect(mocks.persistAttachmentUpload).toHaveBeenCalledTimes(2);
    expect(mocks.createRoom).toHaveBeenCalledTimes(1);
    expect(mocks.createRoom).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      name: "Checkout brief and 1 more",
    });
  });

  it("keeps going after a mid-batch failure and still returns the room", async () => {
    mocks.persistAttachmentUpload.mockImplementation(
      async ({ attachment }) => {
        if (attachment.fileName === "broken.txt") {
          throw new Error("Storage rejected the upload.");
        }
        return {
          id: attachment.id,
          original_name: attachment.fileName,
          extraction_status: attachment.extractionStatus,
        };
      },
    );

    const result = await createRoomFromUploads(
      uploadsFormData([
        textFile("first.txt"),
        textFile("broken.txt"),
        textFile("third.txt"),
      ]),
    );

    expect(result.roomId).toBe(ROOM_ID);
    expect(result.failedFileNames).toEqual(["broken.txt"]);
    // The file after the failure is still attempted, so one bad file
    // cannot silently drop the rest of the batch.
    expect(mocks.persistAttachmentUpload).toHaveBeenCalledTimes(3);
  });

  it("collects a validation-rejected file instead of aborting the batch", async () => {
    // An uncaptioned image fails AttachmentInputSchema. Before this was
    // caught per file it threw out of the whole action, stranding the
    // user on an already-created room.
    const result = await createRoomFromUploads(
      uploadsFormData([
        textFile("brief.md"),
        new File(["binary"], "screenshot.png", { type: "image/png" }),
      ]),
    );

    expect(result.roomId).toBe(ROOM_ID);
    expect(result.failedFileNames).toEqual(["screenshot.png"]);
    expect(mocks.persistAttachmentUpload).toHaveBeenCalledTimes(1);
  });

  it("refuses an empty selection before creating a room", async () => {
    await expect(
      createRoomFromUploads(uploadsFormData([])),
    ).rejects.toThrow("Choose at least one file.");
    expect(mocks.createRoom).not.toHaveBeenCalled();
  });
});
