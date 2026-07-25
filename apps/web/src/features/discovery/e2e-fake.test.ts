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
} from "@/features/workspaces/e2e-fake";
import {
  deriveInvitationToken,
} from "@/features/workspaces/invitation-token";
import {
  fakeAddParticipant,
  fakeCreateRoom,
  fakeGetRoom,
  fakeListMessages,
  fakeListRooms,
  fakePostMessage,
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

  it("is impossible to enable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { isDiscoveryFakeEnabled } = await import("./e2e-gate");
    expect(isDiscoveryFakeEnabled()).toBe(false);
  });
});
