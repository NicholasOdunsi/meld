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
  fakeCreateRoom,
  fakeDeleteRoom,
  fakeDiscardStagedAttachment,
  fakeGetRoom,
  fakeLinkStagedAttachments,
  fakeListMessages,
  fakeListRooms,
  fakePostMessage,
  fakeRemoveParticipant,
  fakeStageAttachment,
} from "./e2e-fake";

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

  beforeEach(() => {
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
    vi.stubEnv("MELD_E2E_FAKE_DISCOVERY", "true");
    vi.stubEnv(
      "INVITATION_TOKEN_SECRET",
      "6Lr5Xn3p2QVv8qFsa0RMXKFF23alHmmad4FUwx_JQDU",
    );
    currentUser = users.owner;
    mocks.cookies.mockImplementation(async () => ({
      get(name: string) {
        const values: Record<string, string> = {
          "meld-e2e-user-id": currentUser.id,
          "meld-e2e-user-email": currentUser.email,
          "meld-e2e-user-name": currentUser.name,
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

  it("is impossible to enable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { isDiscoveryFakeEnabled } = await import("./e2e-gate");
    expect(isDiscoveryFakeEnabled()).toBe(false);
  });
});
