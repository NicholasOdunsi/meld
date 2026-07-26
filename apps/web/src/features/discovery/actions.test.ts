import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  createRoom: vi.fn(),
  addParticipant: vi.fn(),
  claimStagedAttachmentForDiscard: vi.fn(),
  deleteClaimedStagedAttachment: vi.fn(),
  rpc: vi.fn(),
  linkRpc: vi.fn(),
  createSignedUrl: vi.fn(),
  storageRemove: vi.fn(),
  storageFrom: vi.fn(),
  persistAttachmentUpload: vi.fn(),
  extractAttachmentText: vi.fn(),
  isDiscoveryFakeEnabled: vi.fn(),
  listFakeOrganizationPeople: vi.fn(),
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
    addParticipant: mocks.addParticipant,
    claimStagedAttachmentForDiscard:
      mocks.claimStagedAttachmentForDiscard,
    deleteClaimedStagedAttachment:
      mocks.deleteClaimedStagedAttachment,
  }),
}));

vi.mock("./upload-persistence", () => ({
  persistAttachmentUpload: mocks.persistAttachmentUpload,
}));

vi.mock("./attachment-extractor", () => ({
  extractAttachmentText: mocks.extractAttachmentText,
}));

vi.mock("@/features/workspaces/e2e-fake", () => ({
  listFakeOrganizationPeople: mocks.listFakeOrganizationPeople,
}));

import {
  createRoomFromUploads,
  createRoomWithParticipants,
  discardStagedDiscoveryAttachment,
  linkStagedDiscoveryAttachments,
  listRoomInviteCandidates,
  stageDiscoveryAttachment,
} from "./actions";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";
const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const MESSAGE_ID = "50000000-0000-4000-8000-000000000005";
const ATTACHMENT_ID = "60000000-0000-4000-8000-000000000006";

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

  it("returns the generic attachment error when the link RPC rejects", async () => {
    mocks.linkRpc.mockResolvedValue({
      data: null,
      error: { message: "Not every staged attachment could be linked" },
    });

    await expect(
      linkStagedDiscoveryAttachments({
        roomId: ROOM_ID,
        messageId: MESSAGE_ID,
        attachmentIds: [ATTACHMENT_ID],
        caption: "Customer interview screenshot",
      }),
    ).rejects.toThrow("We could not attach every uploaded file.");
  });

  it("claims metadata, removes storage, and then deletes the claim", async () => {
    mocks.claimStagedAttachmentForDiscard.mockResolvedValue({
      storagePath: `${ROOM_ID}/${ATTACHMENT_ID}/interview.png`,
    });

    await discardStagedDiscoveryAttachment({
      roomId: ROOM_ID,
      attachmentId: ATTACHMENT_ID,
    });

    expect(mocks.storageRemove).toHaveBeenCalledWith([
      `${ROOM_ID}/${ATTACHMENT_ID}/interview.png`,
    ]);
    expect(mocks.claimStagedAttachmentForDiscard).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      attachmentId: ATTACHMENT_ID,
    });
    expect(mocks.deleteClaimedStagedAttachment).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      attachmentId: ATTACHMENT_ID,
    });
    expect(
      mocks.claimStagedAttachmentForDiscard.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.storageRemove.mock.invocationCallOrder[0],
    );
    expect(
      mocks.storageRemove.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.deleteClaimedStagedAttachment.mock.invocationCallOrder[0],
    );
  });

  it("does not remove storage when linking wins before the claim", async () => {
    mocks.claimStagedAttachmentForDiscard.mockResolvedValue(null);

    await discardStagedDiscoveryAttachment({
      roomId: ROOM_ID,
      attachmentId: ATTACHMENT_ID,
    });

    expect(mocks.claimStagedAttachmentForDiscard).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      attachmentId: ATTACHMENT_ID,
    });
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    expect(mocks.deleteClaimedStagedAttachment).not.toHaveBeenCalled();
  });

  it("retains a failed storage claim and retries the same path", async () => {
    const storagePath = `${ROOM_ID}/${ATTACHMENT_ID}/interview.png`;
    mocks.claimStagedAttachmentForDiscard.mockResolvedValue({
      storagePath,
    });
    mocks.storageRemove
      .mockResolvedValueOnce({
        data: null,
        error: { message: "storage unavailable" },
      })
      .mockResolvedValueOnce({ data: [], error: null });

    await expect(
      discardStagedDiscoveryAttachment({
        roomId: ROOM_ID,
        attachmentId: ATTACHMENT_ID,
      }),
    ).rejects.toThrow("We could not discard the staged attachment.");
    expect(mocks.deleteClaimedStagedAttachment).not.toHaveBeenCalled();

    await expect(
      discardStagedDiscoveryAttachment({
        roomId: ROOM_ID,
        attachmentId: ATTACHMENT_ID,
      }),
    ).resolves.toBeUndefined();

    expect(mocks.claimStagedAttachmentForDiscard).toHaveBeenCalledTimes(2);
    expect(mocks.storageRemove).toHaveBeenNthCalledWith(1, [storagePath]);
    expect(mocks.storageRemove).toHaveBeenNthCalledWith(2, [storagePath]);
    expect(mocks.deleteClaimedStagedAttachment).toHaveBeenCalledOnce();
  });
});

describe("createRoomWithParticipants", () => {
  const PARTICIPANT_ID = "10000000-0000-4000-8000-000000000002";

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
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
    mocks.createRoom.mockResolvedValue({ id: ROOM_ID });
    mocks.addParticipant.mockResolvedValue({});
  });

  it("creates the room and adds every requested participant", async () => {
    const result = await createRoomWithParticipants({
      organizationId: ORGANIZATION_ID,
      name: "Customer interviews",
      participantUserIds: [PARTICIPANT_ID],
    });

    expect(result).toEqual({ roomId: ROOM_ID, failedUserIds: [] });
    expect(mocks.createRoom).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      name: "Customer interviews",
    });
    expect(mocks.addParticipant).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      userId: PARTICIPANT_ID,
      access: "edit",
    });
  });

  it("keeps going after a failed invite and still returns the room", async () => {
    mocks.addParticipant.mockRejectedValue(
      new Error("Row-level security violation."),
    );

    const result = await createRoomWithParticipants({
      organizationId: ORGANIZATION_ID,
      name: "Customer interviews",
      participantUserIds: [PARTICIPANT_ID],
    });

    expect(result.roomId).toBe(ROOM_ID);
    expect(result.failedUserIds).toEqual([PARTICIPANT_ID]);
  });

  it("creates a room with no participants", async () => {
    const result = await createRoomWithParticipants({
      organizationId: ORGANIZATION_ID,
      name: "Customer interviews",
      participantUserIds: [],
    });

    expect(result).toEqual({ roomId: ROOM_ID, failedUserIds: [] });
    expect(mocks.addParticipant).not.toHaveBeenCalled();
  });
});

describe("listRoomInviteCandidates", () => {
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
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
    });
  });

  it("maps organization members from the RPC result", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          user_id: "10000000-0000-4000-8000-000000000002",
          email: "ada@example.com",
        },
      ],
      error: null,
    });

    const result = await listRoomInviteCandidates(ORGANIZATION_ID);

    expect(result).toEqual([
      {
        userId: "10000000-0000-4000-8000-000000000002",
        email: "ada@example.com",
      },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_organization_members", {
      target_organization_id: ORGANIZATION_ID,
    });
  });

  it("throws a generic error when the RPC fails", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "permission denied" },
    });

    await expect(
      listRoomInviteCandidates(ORGANIZATION_ID),
    ).rejects.toThrow("We could not load organization members.");
  });

  it("maps organization members from the fake-mode store in test mode", async () => {
    mocks.isDiscoveryFakeEnabled.mockReturnValue(true);
    mocks.listFakeOrganizationPeople.mockResolvedValue({
      isAdmin: false,
      members: [
        {
          user_id: "10000000-0000-4000-8000-000000000002",
          email: "ada@example.com",
        },
      ],
      invitations: [],
    });

    const result = await listRoomInviteCandidates(ORGANIZATION_ID);

    expect(result).toEqual([
      {
        userId: "10000000-0000-4000-8000-000000000002",
        email: "ada@example.com",
      },
    ]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
