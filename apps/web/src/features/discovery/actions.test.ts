import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  createRoom: vi.fn(),
  deleteStagedAttachment: vi.fn(),
  linkRpc: vi.fn(),
  createSignedUrl: vi.fn(),
  storageRemove: vi.fn(),
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
  createDiscoveryRepository: () => ({
    createRoom: mocks.createRoom,
    deleteStagedAttachment: mocks.deleteStagedAttachment,
  }),
}));

vi.mock("./upload-persistence", () => ({
  persistAttachmentUpload: mocks.persistAttachmentUpload,
}));

vi.mock("./attachment-extractor", () => ({
  extractAttachmentText: mocks.extractAttachmentText,
}));

import {
  createRoomFromUploads,
  discardStagedDiscoveryAttachment,
  linkStagedDiscoveryAttachments,
  stageDiscoveryAttachment,
} from "./actions";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";
const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const MESSAGE_ID = "50000000-0000-4000-8000-000000000005";
const ATTACHMENT_ID = "60000000-0000-4000-8000-000000000006";
const SECOND_ATTACHMENT_ID = "70000000-0000-4000-8000-000000000007";

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

describe("staged discovery attachments", () => {
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
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed/interview.png" },
      error: null,
    });
    mocks.storageRemove.mockResolvedValue({ data: [], error: null });
    mocks.storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      createSignedUrl: mocks.createSignedUrl,
      remove: mocks.storageRemove,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.linkRpc,
      storage: { from: mocks.storageFrom },
    });
    mocks.extractAttachmentText.mockResolvedValue("interview.png");
    mocks.persistAttachmentUpload.mockImplementation(
      async ({ attachment }) => ({
        id: attachment.id,
        message_id: null,
        original_name: attachment.fileName,
        mime_type: attachment.mimeType,
        caption: attachment.caption ?? null,
        extraction_status: attachment.extractionStatus,
        storage_path: attachment.storagePath,
      }),
    );
  });

  it("stages an image with a provisional caption and returns a signed view", async () => {
    const file = new File(["image"], "interview.png", { type: "image/png" });
    const form = new FormData();
    form.set("roomId", ROOM_ID);
    form.set("file", file);

    const result = await stageDiscoveryAttachment(form);

    expect(mocks.persistAttachmentUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({
          roomId: ROOM_ID,
          messageId: undefined,
          caption: "interview.png",
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        messageId: null,
        originalName: "interview.png",
        mimeType: "image/png",
        viewUrl: expect.stringContaining("signed"),
      }),
    );
  });

  it("links every staged id to one message", async () => {
    mocks.linkRpc.mockResolvedValue({
      data: [{ attachment_id: ATTACHMENT_ID }],
      error: null,
    });

    await expect(
      linkStagedDiscoveryAttachments({
        roomId: ROOM_ID,
        messageId: MESSAGE_ID,
        attachmentIds: [ATTACHMENT_ID],
        caption: "Customer interview screenshot",
      }),
    ).resolves.toEqual([ATTACHMENT_ID]);
  });

  it("rejects a mixed partial result so the database transaction rolls back", async () => {
    mocks.linkRpc.mockResolvedValue({
      data: [{ attachment_id: ATTACHMENT_ID }],
      error: null,
    });

    await expect(
      linkStagedDiscoveryAttachments({
        roomId: ROOM_ID,
        messageId: MESSAGE_ID,
        attachmentIds: [ATTACHMENT_ID, SECOND_ATTACHMENT_ID],
        caption: "Customer interview screenshot",
      }),
    ).rejects.toThrow("We could not attach every uploaded file.");
  });

  it("atomically deletes staged metadata before removing storage", async () => {
    mocks.deleteStagedAttachment.mockResolvedValue({
      storagePath: `${ROOM_ID}/${ATTACHMENT_ID}/interview.png`,
    });

    await discardStagedDiscoveryAttachment({
      roomId: ROOM_ID,
      attachmentId: ATTACHMENT_ID,
    });

    expect(mocks.storageRemove).toHaveBeenCalledWith([
      `${ROOM_ID}/${ATTACHMENT_ID}/interview.png`,
    ]);
    expect(mocks.deleteStagedAttachment).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      attachmentId: ATTACHMENT_ID,
    });
    expect(
      mocks.deleteStagedAttachment.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.storageRemove.mock.invocationCallOrder[0],
    );
  });

  it("does not remove storage when linking wins the atomic delete race", async () => {
    mocks.deleteStagedAttachment.mockResolvedValue(null);

    await discardStagedDiscoveryAttachment({
      roomId: ROOM_ID,
      attachmentId: ATTACHMENT_ID,
    });

    expect(mocks.deleteStagedAttachment).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      attachmentId: ATTACHMENT_ID,
    });
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });
});
