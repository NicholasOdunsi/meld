import type { Provider } from "@meld/contracts";
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
  fakeCreateWorkspace,
  fakeCreateProject,
  fakeInviteMember,
  fakeRemoveWorkspaceMember,
} from "@/features/workspaces/e2e-fake";
import {
  deriveInvitationToken,
} from "@/features/workspaces/invitation-token";
import {
  fakeAddParticipant,
  fakeAcceptRoomPrdVersion,
  fakeApplyPrdProposal,
  fakeAssistPrdSection,
  fakeCreateRoom,
  fakeDeleteRoom,
  fakeDiscardPrdProposal,
  fakeDiscardStagedAttachment,
  fakeDismissPrdAssistRequest,
  fakeCreateRoomReplyTask,
  fakeGetPrdAssistRequest,
  fakeGetRoom,
  fakeGetRoomPrd,
  fakeLinkStagedAttachments,
  fakeListMessages,
  fakeListRoomPrdAssistRequests,
  fakeListRoomPrdProposals,
  fakeListRoomTaskStatuses,
  fakeListRoomPrdHistory,
  fakeListRooms,
  fakeMoveRoom,
  fakePostMessage,
  fakeQueuePrdGeneration,
  fakeRemoveParticipant,
  fakeStageAttachment,
  fakeSaveRoomPrdVersion,
  fakeSetRoomStage,
} from "./e2e-fake";
import { prdAssistOutcome } from "@/features/prd/prd-assist-outcome";
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

describe("development Room fake authorization", () => {
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

  async function joinWorkspace(
    workspaceId: string,
    user: typeof users.participant,
  ) {
    currentUser = users.owner;
    const invitation = await fakeInviteMember({
      workspaceId,
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
    const workspace = await fakeCreateWorkspace({
      name: "Northstar",
      projectName: "Mobile app",
    });
    const workspaceId = workspace.workspaceId;
    await joinWorkspace(workspaceId, users.participant);
    await joinWorkspace(workspaceId, users.unrelatedMember);

    currentUser = users.owner;
    const room = await fakeCreateRoom({
      workspaceId,
      projectId: workspace.projectId,
      name: "Customer room",
    });
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "view",
    });

    currentUser = users.participant;
    await expect(fakeListRooms(workspaceId)).resolves.toEqual([room]);
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
    await expect(fakeListRooms(workspaceId)).resolves.toEqual([]);
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

  it("rejects a nonexistent Project when creating a fake Room", async () => {
    const workspace = await fakeCreateWorkspace({
      name: "Project validation",
      projectName: "Mobile app",
    });

    await expect(
      fakeCreateRoom({
        workspaceId: workspace.workspaceId,
        projectId: "70000000-0000-4000-8000-000000000099",
        name: "Invalid project room",
      }),
    ).rejects.toThrow("Project does not belong to the workspace");
  });

  it("rejects a Project from another Workspace when creating a fake Room", async () => {
    const first = await fakeCreateWorkspace({
      name: "First workspace",
      projectName: "First project",
    });
    const second = await fakeCreateWorkspace({
      name: "Second workspace",
      projectName: "Second project",
    });

    await expect(
      fakeCreateRoom({
        workspaceId: first.workspaceId,
        projectId: second.projectId,
        name: "Cross-workspace room",
      }),
    ).rejects.toThrow("Project does not belong to the workspace");
  });

  it("mirrors owner-only stage authorization and same-stage no-op behavior", async () => {
    const workspace = await fakeCreateWorkspace({
      name: "Stage workspace",
      projectName: "Lifecycle project",
    });
    await joinWorkspace(workspace.workspaceId, users.participant);

    currentUser = users.owner;
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
      name: "Stage room",
    });
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "edit",
    });

    currentUser = users.participant;
    await expect(
      fakeSetRoomStage({ roomId: room.id, stage: "design" }),
    ).rejects.toThrow("Room stage access required");

    currentUser = users.owner;
    await expect(
      fakeSetRoomStage({ roomId: room.id, stage: "design" }),
    ).resolves.toBe("design");
    const changed = await fakeGetRoom(room.id);
    const changedAt = changed.room.updatedAt;
    await expect(
      fakeSetRoomStage({ roomId: room.id, stage: "design" }),
    ).resolves.toBe("design");
    await expect(fakeGetRoom(room.id)).resolves.toMatchObject({
      room: { stage: "design", updatedAt: changedAt },
    });
  });

  it("moves owner Rooms with strictly monotonic timestamps and stable no-ops", async () => {
    const workspace = await fakeCreateWorkspace({
      name: "Move workspace",
      projectName: "Source project",
    });
    const target = await fakeCreateProject({
      workspaceId: workspace.workspaceId,
      name: "Target project",
    });
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
      name: "Move room",
    });
    const createdAt = room.updatedAt;

    await expect(
      fakeMoveRoom({
        workspaceId: workspace.workspaceId,
        roomId: room.id,
        projectId: target.id,
      }),
    ).resolves.toBe(target.id);
    const moved = await fakeGetRoom(room.id);
    expect(moved.room.projectId).toBe(target.id);
    expect(moved.room.workspaceId).toBe(workspace.workspaceId);
    expect(moved.room.updatedAt > createdAt).toBe(true);

    const movedAt = moved.room.updatedAt;
    await expect(
      fakeMoveRoom({
        workspaceId: workspace.workspaceId,
        roomId: room.id,
        projectId: target.id,
      }),
    ).resolves.toBe(target.id);
    expect((await fakeGetRoom(room.id)).room.updatedAt).toBe(movedAt);
  });

  it("rejects editor, nonparticipant admin, and cross-Workspace fake moves", async () => {
    const workspace = await fakeCreateWorkspace({
      name: "Move authorization",
      projectName: "Source project",
    });
    const target = await fakeCreateProject({
      workspaceId: workspace.workspaceId,
      name: "Target project",
    });
    const otherWorkspace = await fakeCreateWorkspace({
      name: "Other move workspace",
      projectName: "Other project",
    });
    await joinWorkspace(workspace.workspaceId, users.participant);

    currentUser = users.owner;
    const ownerRoom = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
      name: "Owner move room",
    });
    await fakeAddParticipant({
      roomId: ownerRoom.id,
      userId: users.participant.id,
      access: "edit",
    });

    currentUser = users.participant;
    await expect(
      fakeMoveRoom({
        workspaceId: workspace.workspaceId,
        roomId: ownerRoom.id,
        projectId: target.id,
      }),
    ).rejects.toThrow("Room move access required");

    const participantRoom = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
      name: "Participant-owned room",
    });
    currentUser = users.owner;
    await expect(
      fakeMoveRoom({
        workspaceId: workspace.workspaceId,
        roomId: participantRoom.id,
        projectId: target.id,
      }),
    ).rejects.toThrow("Room move access required");

    await expect(
      fakeMoveRoom({
        workspaceId: workspace.workspaceId,
        roomId: ownerRoom.id,
        projectId: otherWorkspace.projectId,
      }),
    ).rejects.toThrow("Target Project must belong to the Room workspace");
  });

  it("allows a participating fake Workspace admin to move another owner's Room", async () => {
    const workspace = await fakeCreateWorkspace({
      name: "Admin move workspace",
      projectName: "Source project",
    });
    const target = await fakeCreateProject({
      workspaceId: workspace.workspaceId,
      name: "Target project",
    });
    await joinWorkspace(workspace.workspaceId, users.participant);

    currentUser = users.participant;
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
      name: "Participant Room",
    });
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.owner.id,
      access: "view",
    });

    currentUser = users.owner;
    await expect(
      fakeMoveRoom({
        workspaceId: workspace.workspaceId,
        roomId: room.id,
        projectId: target.id,
      }),
    ).resolves.toBe(target.id);
  });

  it("revokes stale participant access immediately without erasing history", async () => {
    const workspace = await fakeCreateWorkspace({
      name: "Revocation org",
      projectName: "Mobile app",
    });
    const workspaceId = workspace.workspaceId;
    await joinWorkspace(workspaceId, users.participant);

    currentUser = users.owner;
    const room = await fakeCreateRoom({
      workspaceId,
      projectId: workspace.projectId,
      name: "Revocation room",
    });
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "view",
    });
    await fakeRemoveWorkspaceMember({
      workspaceId,
      userId: users.participant.id,
    });

    await expect(fakeGetRoom(room.id)).resolves.toMatchObject({
      participants: expect.arrayContaining([
        expect.objectContaining({ userId: users.participant.id }),
      ]),
    });

    currentUser = users.participant;
    await expect(fakeListRooms(workspaceId)).rejects.toThrow(
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
    const workspace = await fakeCreateWorkspace({
      name: "Owner invariant org",
      projectName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
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
    const workspace = await fakeCreateWorkspace({
      name: "PRD persistence org",
      projectName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
      name: "PRD persistence room",
    });
    await expect(fakeGetRoom(room.id)).resolves.toMatchObject({
      isCurrentUserWorkspaceAdmin: true,
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

    await joinWorkspace(workspace.workspaceId, users.participant);
    currentUser = users.owner;
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "edit",
    });
    currentUser = users.participant;
    await expect(fakeGetRoom(room.id)).resolves.toMatchObject({
      isCurrentUserWorkspaceAdmin: false,
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
    const workspace = await fakeCreateWorkspace({
      name: "PRD save validation org",
      projectName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
      name: "PRD save validation room",
    });
    await joinWorkspace(workspace.workspaceId, users.participant);
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
    const workspace = await fakeCreateWorkspace({
      name: "Attachment org",
      projectName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
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
    const workspace = await fakeCreateWorkspace({
      name: "Linked attachment org",
      projectName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
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
    const workspace = await fakeCreateWorkspace({
      name: "Atomic attachment org",
      projectName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
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
    const workspace = await fakeCreateWorkspace({
      name: "Deletable org",
      projectName: "Mobile app",
    });
    const workspaceId = workspace.workspaceId;
    await joinWorkspace(workspaceId, users.participant);

    currentUser = users.owner;
    const room = await fakeCreateRoom({
      workspaceId,
      projectId: workspace.projectId,
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

    await fakeDeleteRoom({ workspaceId, roomId: room.id });

    await expect(fakeListRooms(workspaceId)).resolves.toEqual([]);
    await expect(fakeGetRoom(room.id)).rejects.toThrow("Room not found");
  });

  it("refuses to let a non-owner participant delete the room", async () => {
    const workspace = await fakeCreateWorkspace({
      name: "Protected org",
      projectName: "Mobile app",
    });
    const workspaceId = workspace.workspaceId;
    await joinWorkspace(workspaceId, users.participant);

    currentUser = users.owner;
    const room = await fakeCreateRoom({
      workspaceId,
      projectId: workspace.projectId,
      name: "Owner-only room",
    });
    await fakeAddParticipant({
      roomId: room.id,
      userId: users.participant.id,
      access: "edit",
    });

    currentUser = users.participant;
    await expect(
      fakeDeleteRoom({ workspaceId, roomId: room.id }),
    ).rejects.toThrow("Only the room owner can delete this room.");
    currentUser = users.owner;
    await expect(fakeListRooms(workspaceId)).resolves.toHaveLength(1);
  });

  it("queues a Product Agent reply and delivers one completed message", async () => {
    const workspace = await fakeCreateWorkspace({
      name: "Product Agent org",
      projectName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
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
    const workspace = await fakeCreateWorkspace({
      name: "Recovery org",
      projectName: "Mobile app",
    });
    const room = await fakeCreateRoom({
      workspaceId: workspace.workspaceId,
      projectId: workspace.projectId,
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

  // The fake is the only place a written phrase decides an outcome. It exists
  // so the browser regressions can drive all four outcomes deterministically;
  // production never inspects an instruction, because classifying one is the
  // Product Agent's job.
  describe("PRD section assistance fixtures", () => {
    async function roomWithPrd(name: string) {
      const workspace = await fakeCreateWorkspace({
        name,
        projectName: "Mobile app",
      });
      const room = await fakeCreateRoom({
        workspaceId: workspace.workspaceId,
        projectId: workspace.projectId,
        name,
      });
      await fakeQueuePrdGeneration({ roomId: room.id });
      await fakeListRoomTaskStatuses(room.id);
      await fakeListRoomTaskStatuses(room.id);
      await fakeListRoomTaskStatuses(room.id);
      return { workspaceId: workspace.workspaceId, room };
    }

    const selection = [
      {
        field: "executiveSummary" as const,
        label: "Executive summary",
        quotedText: "Reduce checkout friction while preserving customer trust.",
      },
    ];

    // Two adjacent sections, in document order, for the cases where one
    // selected section has to be told apart from another.
    const multiSectionSelection = [
      {
        field: "goalsNonGoalsAndMetrics" as const,
        label: "Goals & metrics",
        quotedText: "Increase completed checkouts without adding promotions.",
      },
      {
        field: "proposedSolution" as const,
        label: "Proposed solution",
        quotedText:
          "Show a concise, transparent order summary throughout checkout.",
      },
    ];

    async function settleAssist(
      roomId: string,
      instruction: string,
      provider?: Provider,
      sections: typeof selection | typeof multiSectionSelection = selection,
    ) {
      const queued = await fakeAssistPrdSection({
        roomId,
        clientRequestId: randomClientRequestId(),
        sections,
        instruction,
        provider,
      });
      await fakeListRoomTaskStatuses(roomId); // queued -> running
      await fakeListRoomTaskStatuses(roomId); // running -> completed
      const request = await fakeGetPrdAssistRequest({
        roomId,
        requestId: queued.requestId,
      });
      return { queued, request: request! };
    }

    let nextClientRequestId = 1;
    const randomClientRequestId = () =>
      `90000000-0000-4000-8000-${String(nextClientRequestId++).padStart(12, "0")}`;

    it.each([
      ["Why did we choose this?", "answer"],
      ["Rewrite this for small teams.", "edit"],
      ["Explain this and make the rationale clearer.", "answer_and_edit"],
      ["Fix this.", "clarification"],
      ["Anything the fixtures never mention.", "answer"],
    ])("settles %j as the %s outcome", async (instruction, outcome) => {
      const { room } = await roomWithPrd(`Assist ${instruction}`);
      const { request } = await settleAssist(room.id, instruction);

      expect(request.status).toBe("ready");
      expect(prdAssistOutcome(request)).toBe(outcome);
      expect(request.instruction).toBe(instruction);
      expect(request.selectedSections).toEqual(selection);
    });

    // The failed outcome has to be reachable without a real provider, or the
    // popover's recovery half -- Retry and the alternate provider -- has no
    // way to be exercised end to end.
    it("settles a seeded recovery status as a failed outcome", async () => {
      const { room } = await roomWithPrd("Assist failure");
      seededTaskStatus = "usage_limit_reached";

      const { request } = await settleAssist(room.id, "Why did we choose this?");

      expect(request.status).toBe("failed");
      expect(request.errorCode).toBe("usage_limit_reached");
      expect(prdAssistOutcome(request)).toBe("failed");
      expect(request.answer).toBeNull();
      expect(request.clarifyingQuestion).toBeNull();
      expect(await fakeListRoomPrdProposals(room.id)).toEqual([]);
    });

    it("lets the alternate provider recover a seeded failure", async () => {
      const { room } = await roomWithPrd("Assist provider recovery");
      seededTaskStatus = "usage_limit_reached";

      const failed = await settleAssist(room.id, "Why did we choose this?");
      expect(prdAssistOutcome(failed.request)).toBe("failed");

      // A seeded limit belongs to the provider that hit it, so retrying on the
      // other one settles normally even with the cookie still in place.
      const retried = await settleAssist(
        room.id,
        "Why did we choose this?",
        "claude",
      );
      expect(retried.request.provider).toBe("claude");
      expect(prdAssistOutcome(retried.request)).toBe("answer");
    });

    it("closes a settled request off the reader's recovery list", async () => {
      const { room } = await roomWithPrd("Assist dismissal");
      const { queued } = await settleAssist(room.id, "Why did we choose this?");

      await fakeDismissPrdAssistRequest({
        roomId: room.id,
        requestId: queued.requestId,
      });

      await expect(
        fakeListRoomPrdAssistRequests({ roomId: room.id }),
      ).resolves.toEqual([]);
      // Dismissal is the reader's marker, not a deletion: the answer survives.
      const request = await fakeGetPrdAssistRequest({
        roomId: room.id,
        requestId: queued.requestId,
      });
      expect(request?.status).toBe("dismissed");
      expect(request?.answer).not.toBeNull();
    });

    it("refuses to close a request that is still running", async () => {
      const { room } = await roomWithPrd("Assist dismissal while pending");
      const queued = await fakeAssistPrdSection({
        roomId: room.id,
        clientRequestId: randomClientRequestId(),
        sections: selection,
        instruction: "Why did we choose this?",
      });

      await expect(
        fakeDismissPrdAssistRequest({
          roomId: room.id,
          requestId: queued.requestId,
        }),
      ).rejects.toThrow("no longer dismissable");
    });

    it("produces the same result for the same phrase every time", async () => {
      const first = await roomWithPrd("Assist determinism one");
      const second = await roomWithPrd("Assist determinism two");

      const one = await settleAssist(first.room.id, "Why did we choose this?");
      const two = await settleAssist(second.room.id, "Why did we choose this?");

      expect(one.request.answer).toBe(two.request.answer);
      expect(one.request.answer).not.toBeNull();
    });

    it("materializes one ready proposal for an edit outcome", async () => {
      const { room } = await roomWithPrd("Assist edit room");
      const { request } = await settleAssist(
        room.id,
        "Rewrite this for small teams.",
      );

      expect(request.proposalId).not.toBeNull();
      const proposals = await fakeListRoomPrdProposals(room.id);
      expect(proposals).toEqual([
        expect.objectContaining({
          id: request.proposalId,
          sectionField: "executiveSummary",
          status: "ready",
        }),
      ]);
    });

    // A multi-section scope is where "one proposal, and only for the section
    // the instruction actually names" stops being free: the first selected
    // section is the wrong answer, and the browser regression that proves the
    // card lands in the right place needs the fixture to name one.
    it("targets the selected section the instruction names, not the first one", async () => {
      const { room } = await roomWithPrd("Assist targeted multi-section edit");
      const { request } = await settleAssist(
        room.id,
        "Rewrite the Proposed solution for small teams.",
        undefined,
        multiSectionSelection,
      );

      expect(prdAssistOutcome(request)).toBe("edit");
      const proposals = await fakeListRoomPrdProposals(room.id);
      expect(proposals).toEqual([
        expect.objectContaining({
          id: request.proposalId,
          sectionField: "proposedSolution",
          sectionLabel: "Proposed solution",
          status: "ready",
        }),
      ]);
    });

    it("asks which section to change first when a request names several", async () => {
      const { room } = await roomWithPrd("Assist multi-section clarification");
      const { request } = await settleAssist(
        room.id,
        "Rewrite both.",
        undefined,
        multiSectionSelection,
      );

      expect(prdAssistOutcome(request)).toBe("clarification");
      expect(request.clarifyingQuestion).toBe(
        "Which section should I change first?",
      );
      expect(request.proposalId).toBeNull();
      expect(await fakeListRoomPrdProposals(room.id)).toEqual([]);
    });

    it("freezes a view-only requester out of the edit half", async () => {
      const { workspaceId, room } = await roomWithPrd("Assist view-only");
      await joinWorkspace(workspaceId, users.participant);
      currentUser = users.owner;
      await fakeAddParticipant({
        roomId: room.id,
        userId: users.participant.id,
        access: "view",
      });

      currentUser = users.participant;
      const { request } = await settleAssist(
        room.id,
        "Rewrite this for small teams.",
      );

      expect(request.canProposeEdit).toBe(false);
      expect(request.proposalId).toBeNull();
      expect(prdAssistOutcome(request)).toBe("answer");
      expect(await fakeListRoomPrdProposals(room.id)).toEqual([]);
    });

    it("replays one client request id instead of queueing a second task", async () => {
      const { room } = await roomWithPrd("Assist idempotency");
      const clientRequestId = randomClientRequestId();
      const first = await fakeAssistPrdSection({
        roomId: room.id,
        clientRequestId,
        sections: selection,
        instruction: "Why did we choose this?",
      });
      const replay = await fakeAssistPrdSection({
        roomId: room.id,
        clientRequestId,
        sections: selection,
        instruction: "Why did we choose this?",
      });

      expect(replay).toEqual(first);
      await expect(
        fakeListRoomPrdAssistRequests({ roomId: room.id }),
      ).resolves.toHaveLength(1);
    });

    it("recovers the reader's own in-flight requests and hides another's", async () => {
      const { workspaceId, room } = await roomWithPrd("Assist recovery");
      await joinWorkspace(workspaceId, users.participant);
      currentUser = users.owner;
      await fakeAddParticipant({
        roomId: room.id,
        userId: users.participant.id,
        access: "edit",
      });

      const mine = await fakeAssistPrdSection({
        roomId: room.id,
        clientRequestId: randomClientRequestId(),
        sections: selection,
        instruction: "Why did we choose this?",
      });

      currentUser = users.participant;
      await fakeAssistPrdSection({
        roomId: room.id,
        clientRequestId: randomClientRequestId(),
        sections: selection,
        instruction: "Fix this.",
      });
      const theirs = await fakeListRoomPrdAssistRequests({ roomId: room.id });
      expect(theirs.map((request) => request.id)).not.toContain(mine.requestId);

      currentUser = users.owner;
      const recovered = await fakeListRoomPrdAssistRequests({ roomId: room.id });
      expect(recovered.map((request) => request.id)).toEqual([mine.requestId]);
      expect(prdAssistOutcome(recovered[0])).toBe("pending");
    });

    it("refuses a request from outside the room", async () => {
      const { workspaceId, room } = await roomWithPrd("Assist outsider");
      await joinWorkspace(workspaceId, users.unrelatedMember);

      currentUser = users.unrelatedMember;
      await expect(
        fakeAssistPrdSection({
          roomId: room.id,
          clientRequestId: randomClientRequestId(),
          sections: selection,
          instruction: "Why did we choose this?",
        }),
      ).rejects.toThrow("Room participation required");
    });

    it("does not hand a request to a caller who names the wrong room", async () => {
      const first = await roomWithPrd("Assist scoping one");
      const second = await roomWithPrd("Assist scoping two");
      const queued = await fakeAssistPrdSection({
        roomId: first.room.id,
        clientRequestId: randomClientRequestId(),
        sections: selection,
        instruction: "Why did we choose this?",
      });

      await expect(
        fakeGetPrdAssistRequest({
          roomId: second.room.id,
          requestId: queued.requestId,
        }),
      ).resolves.toBeNull();
    });

    it("persists the exchange to Conversation with its frozen PRD context", async () => {
      const { room } = await roomWithPrd("Assist conversation record");
      const before = (await fakeListMessages(room.id)).length;

      const { request } = await settleAssist(room.id, "Why did we choose this?");

      const posted = (await fakeListMessages(room.id)).slice(before);
      expect(posted).toHaveLength(2);
      const [question, answer] = posted;
      expect(question.kind).toBe("prd_context");
      expect(question.authorType).toBe("human");
      expect(question.body).toBe("Why did we choose this?");
      expect(answer.kind).toBe("prd_context");
      expect(answer.authorType).toBe("product_agent");
      expect(answer.body).toBe(request.answer);
      expect(answer.provider).toBe(request.provider);
      for (const message of posted) {
        expect(message.prdContext).toEqual({
          prdId: request.basePrdId,
          version: request.baseVersion,
          sections: selection,
          assistRequestId: request.id,
          proposalId: null,
        });
        expect(message.prdChange).toBeNull();
      }
      // Task 6's "Open in Conversation" link needs both ids to reach the exact
      // message rather than falling back to the tab.
      expect(request.questionMessageId).toBe(question.id);
      expect(request.answerMessageId).toBe(answer.id);
    });

    it("posts a clarifying question as the Product Agent's contextual reply", async () => {
      const { room } = await roomWithPrd("Assist clarification record");
      const before = (await fakeListMessages(room.id)).length;

      const { request } = await settleAssist(room.id, "Fix this.");

      const posted = (await fakeListMessages(room.id)).slice(before);
      expect(posted).toHaveLength(2);
      expect(posted[1].body).toBe(request.clarifyingQuestion);
      expect(posted[1].authorType).toBe("product_agent");
    });

    it("leaves no Conversation record for an edit-only or failed outcome", async () => {
      const { room } = await roomWithPrd("Assist edit silence");
      const before = (await fakeListMessages(room.id)).length;

      const { request } = await settleAssist(
        room.id,
        "Rewrite this for small teams.",
      );

      expect(request.proposalId).not.toBeNull();
      expect((await fakeListMessages(room.id)).length).toBe(before);
      expect(request.questionMessageId).toBeNull();
      expect(request.answerMessageId).toBeNull();

      seededTaskStatus = "usage_limit_reached";
      await settleAssist(room.id, "Why did we choose this?");
      expect((await fakeListMessages(room.id)).length).toBe(before);
    });

    it("posts one compact change entry when a proposal is applied", async () => {
      const { room } = await roomWithPrd("Assist applied change");
      const { request } = await settleAssist(
        room.id,
        "Rewrite this for small teams.",
      );
      const before = (await fakeListMessages(room.id)).length;

      await fakeApplyPrdProposal({
        roomId: room.id,
        proposalId: request.proposalId!,
      });

      const posted = (await fakeListMessages(room.id)).slice(before);
      expect(posted).toHaveLength(1);
      const [change] = posted;
      expect(change.kind).toBe("prd_change");
      expect(change.body).toBe(
        "Applied a Product Agent edit to Executive summary.",
      );
      expect(change.prdContext?.proposalId).toBe(request.proposalId);
      expect(change.prdContext?.assistRequestId).toBe(request.id);
      expect(change.prdContext?.sections).toEqual(selection);
      expect(change.prdChange).toEqual({
        instruction: "Rewrite this for small teams.",
        previousValue: expect.anything(),
        proposedValue: expect.anything(),
      });
    });

    it("leaves no change entry when a proposal is discarded", async () => {
      const { room } = await roomWithPrd("Assist discarded change");
      const { request } = await settleAssist(
        room.id,
        "Rewrite this for small teams.",
      );
      const before = (await fakeListMessages(room.id)).length;

      await fakeDiscardPrdProposal({
        roomId: room.id,
        proposalId: request.proposalId!,
      });

      expect((await fakeListMessages(room.id)).length).toBe(before);
    });
  });

  it("is impossible to enable in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { isRoomFakeEnabled } = await import("./e2e-gate");
    expect(isRoomFakeEnabled()).toBe(false);
  });
});
