import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getClaims: vi.fn(),
  createRoom: vi.fn(),
  addParticipant: vi.fn(),
  claimStagedAttachmentForDiscard: vi.fn(),
  deleteClaimedStagedAttachment: vi.fn(),
  listAttachmentStoragePaths: vi.fn(),
  deleteRoom: vi.fn(),
  rpc: vi.fn(),
  linkRpc: vi.fn(),
  createSignedUrl: vi.fn(),
  storageRemove: vi.fn(),
  storageFrom: vi.fn(),
  persistAttachmentUpload: vi.fn(),
  extractAttachmentText: vi.fn(),
  isDiscoveryFakeEnabled: vi.fn(),
  listFakeOrganizationPeople: vi.fn(),
  getFakeUser: vi.fn(),
  revalidatePath: vi.fn(),
  postHumanMessage: vi.fn(),
  // Canary: the repository/backend has no message-deletion method reachable
  // from postMessage. If a future change added a delete-on-failure rollback,
  // it would most naturally call something like this, and the never-delete
  // test below asserts it is never invoked.
  deleteMessage: vi.fn(),
  createRoomReplyTask: vi.fn(),
  resolveAgentReadiness: vi.fn(),
}));

// revalidatePath needs Next's request store, which a plain unit test has
// no way to provide.
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
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
    postMessage: mocks.postHumanMessage,
    deleteMessage: mocks.deleteMessage,
    claimStagedAttachmentForDiscard:
      mocks.claimStagedAttachmentForDiscard,
    deleteClaimedStagedAttachment:
      mocks.deleteClaimedStagedAttachment,
    listAttachmentStoragePaths: mocks.listAttachmentStoragePaths,
    deleteRoom: mocks.deleteRoom,
  }),
}));

vi.mock("@/features/ai/create-room-reply-task", () => ({
  createRoomReplyTask: mocks.createRoomReplyTask,
}));

vi.mock("@/features/ai/agent-readiness", () => ({
  resolveAgentReadiness: mocks.resolveAgentReadiness,
}));

vi.mock("./upload-persistence", () => ({
  persistAttachmentUpload: mocks.persistAttachmentUpload,
}));

vi.mock("./attachment-extractor", () => ({
  extractAttachmentText: mocks.extractAttachmentText,
}));

vi.mock("@/features/workspaces/e2e-fake", () => ({
  listFakeOrganizationPeople: mocks.listFakeOrganizationPeople,
  getFakeUser: mocks.getFakeUser,
}));

import {
  createRoomFromBrief,
  createRoomFromUploads,
  createRoomWithParticipants,
  deleteDiscoveryRoom,
  discardStagedDiscoveryAttachment,
  getAgentReadiness,
  linkStagedDiscoveryAttachments,
  listRoomInviteCandidates,
  postMessage,
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
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        },
      },
      error: null,
    });
    mocks.storageFrom.mockReturnValue({ upload: vi.fn() });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
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
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "10000000-0000-4000-8000-000000000001",
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
      auth: { getClaims: mocks.getClaims },
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

  it("resolves an empty browser MIME type from the file extension", async () => {
    const file = new File(["goal: ship"], "brief.md", { type: "" });
    const formData = new FormData();
    formData.set("roomId", ROOM_ID);
    formData.set("file", file);

    await stageDiscoveryAttachment(formData);

    // extractAttachmentText is mocked; assert it saw the resolved MIME, not "".
    expect(mocks.extractAttachmentText).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: "text/markdown" }),
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

describe("deleteDiscoveryRoom", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isDiscoveryFakeEnabled.mockReturnValue(false);
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        },
      },
      error: null,
    });
    mocks.storageRemove.mockResolvedValue({ data: [], error: null });
    mocks.storageFrom.mockReturnValue({ remove: mocks.storageRemove });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
      storage: { from: mocks.storageFrom },
    });
    mocks.deleteRoom.mockResolvedValue(undefined);
  });

  it("deletes the room, then removes its attachments from storage", async () => {
    mocks.listAttachmentStoragePaths.mockResolvedValue([
      `${ROOM_ID}/${ATTACHMENT_ID}/interview.png`,
    ]);

    await deleteDiscoveryRoom({
      organizationId: ORGANIZATION_ID,
      roomId: ROOM_ID,
    });

    expect(mocks.deleteRoom).toHaveBeenCalledWith(ROOM_ID);
    expect(mocks.storageRemove).toHaveBeenCalledWith([
      `${ROOM_ID}/${ATTACHMENT_ID}/interview.png`,
    ]);
    expect(
      mocks.deleteRoom.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.storageRemove.mock.invocationCallOrder[0]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/${ORGANIZATION_ID}`,
      "layout",
    );
  });

  it("skips storage removal when the room has no attachments", async () => {
    mocks.listAttachmentStoragePaths.mockResolvedValue([]);

    await deleteDiscoveryRoom({
      organizationId: ORGANIZATION_ID,
      roomId: ROOM_ID,
    });

    expect(mocks.deleteRoom).toHaveBeenCalledWith(ROOM_ID);
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });

  it("does not touch storage when a non-owner delete is rejected", async () => {
    mocks.listAttachmentStoragePaths.mockResolvedValue([
      `${ROOM_ID}/${ATTACHMENT_ID}/interview.png`,
    ]);
    mocks.deleteRoom.mockRejectedValue(
      new Error("Only the room owner can delete this room."),
    );

    await expect(
      deleteDiscoveryRoom({
        organizationId: ORGANIZATION_ID,
        roomId: ROOM_ID,
      }),
    ).rejects.toThrow("Only the room owner can delete this room.");
    expect(mocks.storageRemove).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("createRoomWithParticipants", () => {
  const PARTICIPANT_ID = "10000000-0000-4000-8000-000000000002";

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isDiscoveryFakeEnabled.mockReturnValue(false);
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        },
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
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

  it("verifies the session only once for the whole batch", async () => {
    // Each auth verification used to be a network round trip to the Auth server. This
    // previously ran once for the action, again inside the room write, and
    // once more per invite -- four sequential re-verifications of one
    // already-valid session, which is what made this slow.
    await createRoomWithParticipants({
      organizationId: ORGANIZATION_ID,
      name: "Customer interviews",
      participantUserIds: [
        PARTICIPANT_ID,
        "10000000-0000-4000-8000-000000000003",
      ],
    });

    expect(mocks.getClaims).toHaveBeenCalledTimes(1);
    expect(mocks.addParticipant).toHaveBeenCalledTimes(2);
  });

  it("ignores duplicate participant ids", async () => {
    // room_participants is keyed on (room_id, user_id), so a repeated id
    // would collide and surface as a spurious failed invite.
    const result = await createRoomWithParticipants({
      organizationId: ORGANIZATION_ID,
      name: "Customer interviews",
      participantUserIds: [PARTICIPANT_ID, PARTICIPANT_ID],
    });

    expect(result.failedUserIds).toEqual([]);
    expect(mocks.addParticipant).toHaveBeenCalledTimes(1);
  });

  it("revalidates the organization layout so the sidebar shows the new room", async () => {
    await createRoomWithParticipants({
      organizationId: ORGANIZATION_ID,
      name: "Customer interviews",
      participantUserIds: [],
    });

    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/${ORGANIZATION_ID}`,
      "layout",
    );
  });
});

describe("listRoomInviteCandidates", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isDiscoveryFakeEnabled.mockReturnValue(false);
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        },
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
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

  it("excludes the current user from the candidate list", async () => {
    // The current user (10000000-...-001, per this describe block's
    // beforeEach) is already the room's owner by the time this list is
    // shown, so inviting themselves is meaningless.
    mocks.rpc.mockResolvedValue({
      data: [
        {
          user_id: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        },
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

  it("excludes the current user from the fake-mode candidate list", async () => {
    mocks.isDiscoveryFakeEnabled.mockReturnValue(true);
    mocks.getFakeUser.mockResolvedValue({
      id: "10000000-0000-4000-8000-000000000001",
      email: "owner@example.com",
    });
    mocks.listFakeOrganizationPeople.mockResolvedValue({
      isAdmin: false,
      members: [
        {
          user_id: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        },
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
  });
});

describe("postMessage", () => {
  const CLIENT_ID = "20000000-0000-4000-8000-000000000002";
  const PERSISTED_MESSAGE_ID = "50000000-0000-4000-8000-000000000005";
  const TASK_ID = "70000000-0000-4000-8000-000000000007";

  const input = {
    roomId: ROOM_ID,
    clientId: CLIENT_ID,
    body: "Ask @Product Agent for the signals",
    mentionedUserIds: [] as string[],
    mentionsProductAgent: false,
  };

  const persistedMessage = {
    id: PERSISTED_MESSAGE_ID,
    roomId: ROOM_ID,
    clientId: CLIENT_ID,
    authorId: "10000000-0000-4000-8000-000000000001",
    authorName: "Owner Example",
    body: input.body,
    createdAt: "2026-07-31T12:00:00.000Z",
    delivery: "persisted" as const,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isDiscoveryFakeEnabled.mockReturnValue(false);
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        },
      },
      error: null,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
      // Real backend's linkStagedAttachments calls supabase.rpc directly
      // (it does not go through the mocked repository), so this describe
      // block needs the rpc mock wired the same way the staged-attachments
      // tests below wire it.
      rpc: mocks.linkRpc,
    });
    mocks.postHumanMessage.mockResolvedValue(persistedMessage);
  });

  it("persists the human message without a task when there is no mention", async () => {
    const result = await postMessage({
      ...input,
      mentionsProductAgent: false,
    });

    expect(mocks.postHumanMessage).toHaveBeenCalledTimes(1);
    expect(mocks.createRoomReplyTask).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: persistedMessage,
      agentTask: { status: "not_requested" },
    });
  });

  it("links attachments before creating the reply task", async () => {
    const order: string[] = [];
    // linkStagedAttachments (real supabase backend) resolves via supabase.rpc,
    // wired to mocks.linkRpc in this describe block's beforeEach.
    mocks.linkRpc.mockImplementation(async () => {
      order.push("link");
      return {
        data: [
          { attachment_id: "a0000000-0000-4000-8000-000000000001" },
        ],
        error: null,
      };
    });
    mocks.createRoomReplyTask.mockImplementation(async () => {
      order.push("task");
      return { id: TASK_ID };
    });

    await postMessage({
      ...input,
      mentionsProductAgent: true,
      attachmentIds: ["a0000000-0000-4000-8000-000000000001"],
    });

    expect(order).toEqual(["link", "task"]);
  });

  it("persists the human message before creating the room-reply task and forwards the provider override", async () => {
    mocks.createRoomReplyTask.mockResolvedValue({ id: TASK_ID });

    const result = await postMessage({
      ...input,
      mentionsProductAgent: true,
      providerOverride: "claude",
    });

    // The invariant: persist-then-task, proven by invocation order.
    expect(
      mocks.postHumanMessage.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.createRoomReplyTask.mock.invocationCallOrder[0],
    );
    expect(mocks.createRoomReplyTask).toHaveBeenCalledWith({
      sourceMessageId: PERSISTED_MESSAGE_ID,
      provider: "claude",
    });
    expect(result).toEqual({
      message: persistedMessage,
      agentTask: { status: "queued", taskId: TASK_ID },
    });
  });

  it("resolves the saved default provider when no override is given", async () => {
    mocks.createRoomReplyTask.mockResolvedValue({ id: TASK_ID });

    await postMessage({ ...input, mentionsProductAgent: true });

    expect(mocks.createRoomReplyTask).toHaveBeenCalledWith({
      sourceMessageId: PERSISTED_MESSAGE_ID,
      provider: undefined,
    });
  });

  it("keeps the persisted message and returns a retryable error when task creation fails", async () => {
    mocks.createRoomReplyTask.mockRejectedValue(
      new Error("We could not ask the Product Agent to reply."),
    );

    const result = await postMessage({
      ...input,
      mentionsProductAgent: true,
      providerOverride: "codex",
    });

    // Never deleted or rolled back: the message survives a failed task. The
    // human message persisted exactly once, and NO deletion of any kind ran on
    // the failure path -- not a message delete, a room delete, or a staged
    // attachment discard. A future delete-on-failure regression fails here.
    expect(mocks.postHumanMessage).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMessage).not.toHaveBeenCalled();
    expect(mocks.deleteRoom).not.toHaveBeenCalled();
    expect(mocks.deleteClaimedStagedAttachment).not.toHaveBeenCalled();
    expect(mocks.claimStagedAttachmentForDiscard).not.toHaveBeenCalled();
    expect(result.message).toEqual(persistedMessage);
    expect(result.agentTask).toEqual({
      status: "retryable_error",
      message: "We could not ask the Product Agent to reply.",
    });
  });
});

describe("getAgentReadiness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({ from: vi.fn() });
  });

  it("returns readiness resolved from the authenticated session", async () => {
    const readiness = {
      ready: true as const,
      defaultProvider: "codex" as const,
      defaultDeviceId: "30000000-0000-4000-8000-000000000003",
      providers: [
        {
          provider: "codex" as const,
          deviceId: "30000000-0000-4000-8000-000000000003",
          deviceName: "Ada's MacBook",
        },
      ],
    };
    mocks.resolveAgentReadiness.mockResolvedValue(readiness);

    await expect(getAgentReadiness()).resolves.toEqual(readiness);
    expect(mocks.createClient).toHaveBeenCalledOnce();
    expect(mocks.resolveAgentReadiness).toHaveBeenCalledOnce();
  });
});

describe("createRoomFromBrief", () => {
  const STAGED_ATTACHMENT_ID =
    "a0000000-0000-4000-8000-000000000010";
  const STAGED_ATTACHMENT_ID_NOT_READY =
    "a0000000-0000-4000-8000-000000000011";
  const BRIEF_MESSAGE_ID = "50000000-0000-4000-8000-00000000000b";
  const TASK_ID = "70000000-0000-4000-8000-000000000007";

  const persistedBriefMessage = {
    id: BRIEF_MESSAGE_ID,
    roomId: ROOM_ID,
    clientId: "20000000-0000-4000-8000-00000000000c",
    authorId: "10000000-0000-4000-8000-000000000001",
    authorName: "Owner Example",
    body: "@Product Agent — please review this brief and give me a breakdown of it.",
    createdAt: "2026-07-31T12:00:00.000Z",
    delivery: "persisted" as const,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isDiscoveryFakeEnabled.mockReturnValue(false);
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          sub: "10000000-0000-4000-8000-000000000001",
          email: "owner@example.com",
        },
      },
      error: null,
    });
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed/brief" },
      error: null,
    });
    mocks.storageFrom.mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
      createSignedUrl: mocks.createSignedUrl,
    });
    mocks.createClient.mockResolvedValue({
      auth: { getClaims: mocks.getClaims },
      // Both linkStagedAttachments (postMessage's boundary call) and
      // stageAttachment's caller share this client, matching how the
      // staged-attachments and postMessage describes above wire it.
      rpc: mocks.linkRpc,
      storage: { from: mocks.storageFrom },
    });
    mocks.createRoom.mockResolvedValue({ id: ROOM_ID });
    mocks.extractAttachmentText.mockResolvedValue("extracted brief text");
    mocks.postHumanMessage.mockResolvedValue(persistedBriefMessage);
  });

  it("posts an @Product Agent opener with the brief linked when ready", async () => {
    mocks.resolveAgentReadiness.mockResolvedValue({
      ready: true,
      defaultProvider: "codex",
      defaultDeviceId: "d0000000-0000-4000-8000-000000000000",
      providers: [
        {
          provider: "codex",
          deviceId: "d0000000-0000-4000-8000-000000000000",
          deviceName: "Ada's Mac",
        },
      ],
    });
    // persistAttachmentUpload is the same boundary the "stages an image..."
    // test above drives; stageAttachment (supabase-backend.ts) generates its
    // own random attachment id and hands it to this call, so pinning the
    // mock's resolved id is what lets the test assert on a known id.
    mocks.persistAttachmentUpload.mockResolvedValue({
      id: STAGED_ATTACHMENT_ID,
      message_id: null,
      original_name: "brief.pdf",
      mime_type: "application/pdf",
      caption: null,
      extraction_status: "ready",
      storage_path: `${ROOM_ID}/${STAGED_ATTACHMENT_ID}/brief.pdf`,
    });
    mocks.linkRpc.mockResolvedValue({
      data: [{ attachment_id: STAGED_ATTACHMENT_ID }],
      error: null,
    });
    mocks.createRoomReplyTask.mockResolvedValue({ id: TASK_ID });

    const formData = new FormData();
    formData.set("organizationId", ORGANIZATION_ID);
    formData.append(
      "files",
      new File(["brief"], "brief.pdf", { type: "application/pdf" }),
    );

    const result = await createRoomFromBrief(formData);

    expect(result).toEqual({
      ready: true,
      roomId: ROOM_ID,
      failedFileNames: [],
    });

    // postMessage is a same-module call from createRoomFromBrief, so it
    // cannot be spied on directly (vi.spyOn/vi.mock cannot intercept a
    // module's calls to its own exports). Instead, assert on the boundary
    // effects postMessage produces through the already-mocked backend/RPC
    // layer: the persisted human message it wrote via the repository mock,
    // the staged-attachment link RPC, and the queued reply task.
    expect(mocks.postHumanMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: ROOM_ID,
        mentionsProductAgent: true,
        attachmentIds: [STAGED_ATTACHMENT_ID],
        body: expect.stringContaining("@Product Agent"),
      }),
    );
    expect(mocks.linkRpc).toHaveBeenCalledWith(
      "link_staged_discovery_attachments",
      expect.objectContaining({
        target_room_id: ROOM_ID,
        target_message_id: BRIEF_MESSAGE_ID,
        target_attachment_ids: [STAGED_ATTACHMENT_ID],
      }),
    );
    expect(mocks.createRoomReplyTask).toHaveBeenCalledWith({
      sourceMessageId: BRIEF_MESSAGE_ID,
      provider: undefined,
    });
  });

  it("returns staged ids without posting when the agent is not ready", async () => {
    mocks.resolveAgentReadiness.mockResolvedValue({
      ready: false,
      reason: "no_device",
    });
    mocks.persistAttachmentUpload.mockResolvedValue({
      id: STAGED_ATTACHMENT_ID_NOT_READY,
      message_id: null,
      original_name: "brief.md",
      mime_type: "text/markdown",
      caption: null,
      extraction_status: "ready",
      storage_path: `${ROOM_ID}/${STAGED_ATTACHMENT_ID_NOT_READY}/brief.md`,
    });

    const formData = new FormData();
    formData.set("organizationId", ORGANIZATION_ID);
    formData.append(
      "files",
      new File(["brief"], "brief.md", { type: "text/markdown" }),
    );

    const result = await createRoomFromBrief(formData);

    expect(result).toEqual({
      ready: false,
      roomId: ROOM_ID,
      stagedAttachmentIds: [STAGED_ATTACHMENT_ID_NOT_READY],
      failedFileNames: [],
    });
    expect(mocks.postHumanMessage).not.toHaveBeenCalled();
    expect(mocks.createRoomReplyTask).not.toHaveBeenCalled();
  });

  it("stages what it can and posts with only the successfully-staged attachment when one of two files fails", async () => {
    mocks.resolveAgentReadiness.mockResolvedValue({
      ready: true,
      defaultProvider: "codex",
      defaultDeviceId: "d0000000-0000-4000-8000-000000000000",
      providers: [
        {
          provider: "codex",
          deviceId: "d0000000-0000-4000-8000-000000000000",
          deviceName: "Ada's Mac",
        },
      ],
    });
    mocks.persistAttachmentUpload.mockImplementation(
      async ({ attachment }) => {
        if (attachment.fileName === "broken.pdf") {
          throw new Error("Storage rejected the upload.");
        }
        return {
          id: STAGED_ATTACHMENT_ID,
          message_id: null,
          original_name: attachment.fileName,
          mime_type: attachment.mimeType,
          caption: null,
          extraction_status: "ready",
          storage_path: `${ROOM_ID}/${STAGED_ATTACHMENT_ID}/${attachment.fileName}`,
        };
      },
    );
    mocks.linkRpc.mockResolvedValue({
      data: [{ attachment_id: STAGED_ATTACHMENT_ID }],
      error: null,
    });
    mocks.createRoomReplyTask.mockResolvedValue({ id: TASK_ID });

    const formData = new FormData();
    formData.set("organizationId", ORGANIZATION_ID);
    formData.append(
      "files",
      new File(["brief"], "brief.pdf", { type: "application/pdf" }),
    );
    formData.append(
      "files",
      new File(["broken"], "broken.pdf", { type: "application/pdf" }),
    );

    const result = await createRoomFromBrief(formData);

    expect(result).toEqual({
      ready: true,
      roomId: ROOM_ID,
      failedFileNames: ["broken.pdf"],
    });
    // The room is created once up front regardless of which files stage, so
    // a mid-batch failure cannot strand the caller without a room to open.
    expect(mocks.createRoom).toHaveBeenCalledTimes(1);
    // Boundary proof (same rationale as the ready-path test above): the
    // opener posted only the id that actually staged, never the failed
    // file's id (which never made it into stagedAttachmentIds).
    expect(mocks.postHumanMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentIds: [STAGED_ATTACHMENT_ID],
      }),
    );
    expect(mocks.linkRpc).toHaveBeenCalledWith(
      "link_staged_discovery_attachments",
      expect.objectContaining({
        target_attachment_ids: [STAGED_ATTACHMENT_ID],
      }),
    );
    expect(mocks.createRoomReplyTask).toHaveBeenCalledOnce();
  });

  it("returns not-ready with no staged ids when every file fails to stage, even though the agent is ready", async () => {
    mocks.resolveAgentReadiness.mockResolvedValue({
      ready: true,
      defaultProvider: "codex",
      defaultDeviceId: "d0000000-0000-4000-8000-000000000000",
      providers: [
        {
          provider: "codex",
          deviceId: "d0000000-0000-4000-8000-000000000000",
          deviceName: "Ada's Mac",
        },
      ],
    });
    mocks.persistAttachmentUpload.mockRejectedValue(
      new Error("Storage rejected the upload."),
    );

    const formData = new FormData();
    formData.set("organizationId", ORGANIZATION_ID);
    formData.append(
      "files",
      new File(["brief"], "brief.pdf", { type: "application/pdf" }),
    );
    formData.append(
      "files",
      new File(["notes"], "notes.md", { type: "text/markdown" }),
    );

    const result = await createRoomFromBrief(formData);

    // Readiness alone does not earn the ready path: with nothing staged
    // there is no brief to link, so this falls into the same not-ready
    // shape as an unready agent.
    expect(result).toEqual({
      ready: false,
      roomId: ROOM_ID,
      stagedAttachmentIds: [],
      failedFileNames: ["brief.pdf", "notes.md"],
    });
    expect(mocks.postHumanMessage).not.toHaveBeenCalled();
    expect(mocks.createRoomReplyTask).not.toHaveBeenCalled();
  });
});
