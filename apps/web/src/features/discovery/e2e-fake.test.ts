import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

import {
  fakeAcceptInvitation,
  fakeCreateOrganization,
  fakeInviteMember,
  fakeRemoveOrganizationMember,
} from "@/features/workspaces/e2e-fake";
import {
  deriveInvitationToken,
} from "@/features/workspaces/invitation-token";
import {
  fakeAddParticipant,
  fakeAcceptRoomPrdVersion,
  fakeCreateRoom,
  fakeDeleteRoom,
  fakeDiscardStagedAttachment,
  fakeCreateRoomReplyTask,
  fakeGetRoom,
  fakeGetRoomPrd,
  fakeLinkStagedAttachments,
  fakeListMessages,
  fakeListRoomTaskStatuses,
  fakeListRoomPrdHistory,
  fakeListRooms,
  fakePostMessage,
  fakeQueuePrdGeneration,
  fakeRemoveParticipant,
  fakeStageAttachment,
  fakeSaveRoomPrdVersion,
} from "./e2e-fake";
import {
  InvalidPrdDocumentError,
  PrdAcceptForbiddenError,
  PrdEditForbiddenError,
  PrdVersionConflictError,
} from "@/features/prd/repository";

const users = {
  owner: {
    id: "10000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    name: "Owner Example",
  },
  participant: {
    id: "10000000-0000-4000-8000-000000000002",
    email: "participant@example.com",
    name: "Participant Example",
  },
  unrelatedMember: {
    id: "10000000-0000-4000-8000-000000000003",
    email: "member@example.com",
    name: "Member Example",
  },
};

describe("development Discovery fake authorization", () => {
  let currentUser = users.owner;
  let seededTaskStatus: string | null = null;

  beforeEach(() => {
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
    vi.stubEnv("MELD_E2E_FAKE_DISCOVERY", "true");
    vi.stubEnv(
      "INVITATION_TOKEN_SECRET",
      "6Lr5Xn3p2QVv8qFsa0RMXKFF23alHmmad4FUwx_JQDU",
    );
    currentUser = users.owner;
    seededTaskStatus = null;
    mocks.cookies.mockImplementation(async () => ({
      get(name: string) {
        const values: Record<string, string> = {
          "meld-e2e-user-id": currentUser.id,
          "meld-e2e-user-email": currentUser.email,
          "meld-e2e-user-name": currentUser.name,
          ...(seededTaskStatus
            ? { "meld-e2e-task-status": seededTaskStatus }
            : {}),
        };
        const value = values[name];
        return value ? { value } : undefined;
      },
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function joinOrganization(
    organizationId: string,
    user: typeof users.participant,
  ) {
    currentUser = users.owner;
    const invitation = await fakeInviteMember({
      organizationId,
      email: user.email,
      productRole: "engineer",
    });
    currentUser = user;
    await fakeAcceptInvitation(
      deriveInvitationToken(
        invitation.invitationId,
        process.env.INVITATION_TOKEN_SECRET!,
      ),
    );
  }

  it("mirrors explicit participant checks for list, post, and subscribe reads", async () => {
    const organization = await fakeCreateOrganization({
      name: "Northstar",
      productName: "Mobile app",
    });
    const organizationId = organization.organizationId;
    await joinOrganization(organizationId, users.participant);
    await joinOrganization(organizationId, users.unrelatedMember);

    currentUser = users.owner;
    const room = await fakeCreateRoom({
      organizationId,
      name: "Customer discovery",
    });
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "view",
    });

    currentUser = users.participant;
    await expect(fakeListRooms(organizationId)).resolves.toEqual([room]);
    await expect(
      fakePostMessage({
        roomId: room.id,
        clientId: "20000000-0000-4000-8000-000000000002",
        body: "Participant note",
        mentionedUserIds: [],
        mentionsProductAgent: false,
      }),
    ).resolves.toMatchObject({ authorId: users.participant.id });
    await expect(fakeListMessages(room.id)).resolves.toHaveLength(1);

    currentUser = users.unrelatedMember;
    await expect(fakeListRooms(organizationId)).resolves.toEqual([]);
    await expect(fakeGetRoom(room.id)).rejects.toThrow(
      "Room participation required",
    );
    await expect(fakeListMessages(room.id)).rejects.toThrow(
      "Room participation required",
    );
    await expect(
      fakePostMessage({
        roomId: room.id,
        clientId: "20000000-0000-4000-8000-000000000003",
        body: "Intrusion",
        mentionedUserIds: [],
        mentionsProductAgent: false,
      }),
    ).rejects.toThrow("Room participation required");
  });

  it("revokes stale participant access immediately without erasing history", async () => {
    const organization = await fakeCreateOrganization({
      name: "Revocation org",
      productName: "Mobile app",
    });
    const organizationId = organization.organizationId;
    await joinOrganization(organizationId, users.participant);

    currentUser = users.owner;
    const room = await fakeCreateRoom({
      organizationId,
      name: "Revocation room",
    });
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "view",
    });
    await fakeRemoveOrganizationMember({
      organizationId,
      userId: users.participant.id,
    });

    await expect(fakeGetRoom(room.id)).resolves.toMatchObject({
      participants: expect.arrayContaining([
        expect.objectContaining({ userId: users.participant.id }),
      ]),
    });

    currentUser = users.participant;
    await expect(fakeListRooms(organizationId)).rejects.toThrow(
      "Authentication required",
    );
    await expect(fakeGetRoom(room.id)).rejects.toThrow(
      "Authentication required",
    );
    await expect(fakeListMessages(room.id)).rejects.toThrow(
      "Authentication required",
    );
    await expect(
      fakePostMessage({
        roomId: room.id,
        clientId: "20000000-0000-4000-8000-000000000004",
        body: "Revoked intrusion",
        mentionedUserIds: [],
        mentionsProductAgent: false,
      }),
    ).rejects.toThrow("Authentication required");
  });

  it("keeps owner participation immutable in the fake path", async () => {
    const organization = await fakeCreateOrganization({
      name: "Owner invariant org",
      productName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      organizationId: organization.organizationId,
      name: "Owner invariant room",
    });

    await expect(
      fakeAddParticipant({
        roomId: room.id,
        userId: users.owner.id,
        access: "view",
      }),
    ).rejects.toThrow("Room owner must retain edit access");
    await expect(
      fakeRemoveParticipant(room.id, users.owner.id),
    ).rejects.toThrow("Room owner participation cannot be removed");
  });

  it("retains generated and saved PRD versions with matching authorization", async () => {
    const organization = await fakeCreateOrganization({
      name: "PRD persistence org",
      productName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      organizationId: organization.organizationId,
      name: "PRD persistence room",
    });
    await expect(fakeGetRoom(room.id)).resolves.toMatchObject({
      isCurrentUserOrgAdmin: true,
    });

    await fakeQueuePrdGeneration({ roomId: room.id });
    await fakeListRoomTaskStatuses(room.id);
    await fakeListRoomTaskStatuses(room.id);
    await fakeListRoomTaskStatuses(room.id);

    const generated = await fakeGetRoomPrd(room.id);
    expect(generated).toMatchObject({
      version: 1,
      createdBy: users.owner.id,
      acceptedAt: null,
      acceptedBy: null,
    });

    const saved = await fakeSaveRoomPrdVersion({
      roomId: room.id,
      baseVersion: 1,
      document: { ...generated!.document, title: "Edited checkout" },
    });
    expect(saved).toMatchObject({
      version: 2,
      status: "draft",
      createdBy: users.owner.id,
    });
    await expect(fakeGetRoomPrd(room.id)).resolves.toMatchObject({ version: 2 });
    await expect(fakeListRoomPrdHistory(room.id)).resolves.toMatchObject([
      { id: saved.id, version: 2 },
      { id: generated!.id, version: 1 },
    ]);

    await expect(
      fakeSaveRoomPrdVersion({
        roomId: room.id,
        baseVersion: 1,
        document: saved.document,
      }),
    ).rejects.toBeInstanceOf(PrdVersionConflictError);

    await joinOrganization(organization.organizationId, users.participant);
    currentUser = users.owner;
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "edit",
    });
    currentUser = users.participant;
    await expect(fakeGetRoom(room.id)).resolves.toMatchObject({
      isCurrentUserOrgAdmin: false,
    });
    await expect(
      fakeAcceptRoomPrdVersion({ roomId: room.id, prdId: saved.id }),
    ).rejects.toBeInstanceOf(PrdAcceptForbiddenError);

    currentUser = users.owner;
    const accepted = await fakeAcceptRoomPrdVersion({
      roomId: room.id,
      prdId: saved.id,
    });
    expect(accepted).toMatchObject({
      status: "accepted",
      acceptedBy: users.owner.id,
    });
    await expect(
      fakeAcceptRoomPrdVersion({ roomId: room.id, prdId: saved.id }),
    ).resolves.toEqual(accepted);
  });

  it("uses real-equivalent typed errors for fake save authorization and validation", async () => {
    const organization = await fakeCreateOrganization({
      name: "PRD save validation org",
      productName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      organizationId: organization.organizationId,
      name: "PRD save validation room",
    });
    await joinOrganization(organization.organizationId, users.participant);
    currentUser = users.owner;
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "view",
    });

    currentUser = users.participant;
    await expect(
      fakeSaveRoomPrdVersion({
        roomId: room.id,
        baseVersion: 0,
        document: {} as never,
      }),
    ).rejects.toBeInstanceOf(PrdEditForbiddenError);

    currentUser = users.owner;
    await expect(
      fakeSaveRoomPrdVersion({
        roomId: room.id,
        baseVersion: 0,
        document: { title: "" } as never,
      }),
    ).rejects.toBeInstanceOf(InvalidPrdDocumentError);
  });

  it("persists a staged image across room reload and discards it", async () => {
    const organization = await fakeCreateOrganization({
      name: "Attachment org",
      productName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      organizationId: organization.organizationId,
      name: "Attachment room",
    });

    const attachment = await fakeStageAttachment({
      roomId: room.id,
      originalName: "interview.png",
      mimeType: "image/png",
      caption: "interview.png",
      extractionStatus: "ready",
      bytes: new TextEncoder().encode("image"),
    });

    await expect(fakeGetRoom(room.id)).resolves.toMatchObject({
      attachments: [
        expect.objectContaining({
          id: attachment.id,
          messageId: null,
          viewUrl: "data:image/png;base64,aW1hZ2U=",
        }),
      ],
    });

    await fakeDiscardStagedAttachment({
      roomId: room.id,
      attachmentId: attachment.id,
    });
    await expect(fakeGetRoom(room.id)).resolves.toMatchObject({
      attachments: [],
    });
  });

  it("links staged ids to a fake message and will not discard them afterward", async () => {
    const organization = await fakeCreateOrganization({
      name: "Linked attachment org",
      productName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      organizationId: organization.organizationId,
      name: "Linked attachment room",
    });
    const message = await fakePostMessage({
      roomId: room.id,
      clientId: "20000000-0000-4000-8000-000000000005",
      body: "Customer interview screenshot",
      mentionedUserIds: [],
      mentionsProductAgent: false,
    });
    const attachment = await fakeStageAttachment({
      roomId: room.id,
      originalName: "interview.png",
      mimeType: "image/png",
      caption: "interview.png",
      extractionStatus: "ready",
      bytes: new TextEncoder().encode("image"),
    });

    await expect(
      fakeLinkStagedAttachments({
        roomId: room.id,
        messageId: message.id,
        attachmentIds: [attachment.id],
        caption: "Customer interview screenshot",
      }),
    ).resolves.toEqual([attachment.id]);
    await fakeDiscardStagedAttachment({
      roomId: room.id,
      attachmentId: attachment.id,
    });

    await expect(fakeGetRoom(room.id)).resolves.toMatchObject({
      attachments: [
        expect.objectContaining({
          id: attachment.id,
          messageId: message.id,
          caption: "Customer interview screenshot",
        }),
      ],
    });
  });

  it("does not persist a fake attachment-only message when linking fails", async () => {
    const organization = await fakeCreateOrganization({
      name: "Atomic attachment org",
      productName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      organizationId: organization.organizationId,
      name: "Atomic attachment room",
    });

    await expect(
      fakePostMessage({
        roomId: room.id,
        clientId: "20000000-0000-4000-8000-00000000000a",
        body: "",
        mentionedUserIds: [],
        mentionsProductAgent: false,
        attachmentIds: ["60000000-0000-4000-8000-000000000099"],
      }),
    ).rejects.toThrow("We could not attach every uploaded file.");

    await expect(fakeListMessages(room.id)).resolves.toEqual([]);
  });

  it("lets the owner delete a room and clears its participants and messages", async () => {
    const organization = await fakeCreateOrganization({
      name: "Deletable org",
      productName: "Mobile app",
    });
    const organizationId = organization.organizationId;
    await joinOrganization(organizationId, users.participant);

    currentUser = users.owner;
    const room = await fakeCreateRoom({
      organizationId,
      name: "Room to delete",
    });
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "edit",
    });
    await fakePostMessage({
      roomId: room.id,
      clientId: "20000000-0000-4000-8000-000000000009",
      body: "Hello",
      mentionedUserIds: [],
      mentionsProductAgent: false,
    });

    await fakeDeleteRoom({ organizationId, roomId: room.id });

    await expect(fakeListRooms(organizationId)).resolves.toEqual([]);
    await expect(fakeGetRoom(room.id)).rejects.toThrow("Room not found");
  });

  it("refuses to let a non-owner participant delete the room", async () => {
    const organization = await fakeCreateOrganization({
      name: "Protected org",
      productName: "Mobile app",
    });
    const organizationId = organization.organizationId;
    await joinOrganization(organizationId, users.participant);

    currentUser = users.owner;
    const room = await fakeCreateRoom({
      organizationId,
      name: "Owner-only room",
    });
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "edit",
    });

    currentUser = users.participant;
    await expect(
      fakeDeleteRoom({ organizationId, roomId: room.id }),
    ).rejects.toThrow("Only the room owner can delete this room.");
    currentUser = users.owner;
    await expect(fakeListRooms(organizationId)).resolves.toHaveLength(1);
  });

  it("queues a Product Agent reply and delivers one completed message", async () => {
    const organization = await fakeCreateOrganization({
      name: "Product Agent org",
      productName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      organizationId: organization.organizationId,
      name: "Product Agent room",
    });

    const humanMessage = await fakePostMessage({
      roomId: room.id,
      clientId: "20000000-0000-4000-8000-000000000010",
      body: "@Product Agent challenge this assumption",
      mentionedUserIds: [],
      mentionsProductAgent: true,
    });

    const task = await fakeCreateRoomReplyTask({
      roomId: room.id,
      sourceMessageId: humanMessage.id,
      provider: "codex",
    });
    expect(task.id).toMatch(/[0-9a-f-]{36}/);

    // First poll advances queued -> running; no reply yet.
    const running = await fakeListRoomTaskStatuses(room.id);
    expect(running).toEqual([
      expect.objectContaining({
        taskId: task.id,
        sourceMessageId: humanMessage.id,
        provider: "codex",
        status: "running",
      }),
    ]);
    expect(await fakeListMessages(room.id)).toHaveLength(1);

    // Second poll settles it and inserts exactly one product_agent reply.
    const completed = await fakeListRoomTaskStatuses(room.id);
    expect(completed[0]?.status).toBe("completed");

    const messages = await fakeListMessages(room.id);
    const agentMessages = messages.filter(
      (message) => message.authorType === "product_agent",
    );
    expect(agentMessages).toHaveLength(1);
    expect(agentMessages[0]).toMatchObject({
      aiTaskId: task.id,
      provider: "codex",
      delivery: "persisted",
    });

    // A further poll never produces a second reply.
    await fakeListRoomTaskStatuses(room.id);
    expect(
      (await fakeListMessages(room.id)).filter(
        (message) => message.authorType === "product_agent",
      ),
    ).toHaveLength(1);
  });

  it("settles a seeded recovery status and posts no reply", async () => {
    const organization = await fakeCreateOrganization({
      name: "Recovery org",
      productName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      organizationId: organization.organizationId,
      name: "Recovery room",
    });
    const humanMessage = await fakePostMessage({
      roomId: room.id,
      clientId: "20000000-0000-4000-8000-000000000011",
      body: "@Product Agent challenge this assumption",
      mentionedUserIds: [],
      mentionsProductAgent: true,
    });
    const task = await fakeCreateRoomReplyTask({
      roomId: room.id,
      sourceMessageId: humanMessage.id,
      provider: "codex",
    });

    seededTaskStatus = "failed";
    await fakeListRoomTaskStatuses(room.id); // running
    const settled = await fakeListRoomTaskStatuses(room.id);
    expect(settled[0]).toMatchObject({ taskId: task.id, status: "failed" });
    expect(
      (await fakeListMessages(room.id)).filter(
        (message) => message.authorType === "product_agent",
      ),
    ).toHaveLength(0);
  });

  it("is impossible to enable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { isDiscoveryFakeEnabled } = await import("./e2e-gate");
    expect(isDiscoveryFakeEnabled()).toBe(false);
  });
});
