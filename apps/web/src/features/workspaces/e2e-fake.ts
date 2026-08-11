import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { isWorkspaceFakeEnabled } from "./e2e-gate";
import {
  deriveInvitationToken,
  hashInvitationToken,
  readInvitationTokenSecret,
} from "./invitation-token";
import type { ProductRole } from "./product-roles";
import type {
  InvitationReference,
  InviteInput,
  WorkspaceInput,
} from "./schemas";
import type {
  CreateProjectInput,
  ProjectReference,
  ProjectSummary,
  RenameProjectInput,
} from "@/features/projects/schemas";

type FakeUser = {
  id: string;
  email: string;
  name: string;
};

type FakeWorkspace = {
  id: string;
  name: string;
  logoPath?: string;
  projectId: string;
  projectName: string;
};

type FakeMembership = {
  workspaceId: string;
  userId: string;
  email: string;
  role: "admin" | "member";
  productRole: ProductRole | null;
  createdAt: string;
};

type FakeInvitation = {
  id: string;
  workspaceId: string;
  email: string;
  productRole: ProductRole;
  invitedBy: string;
  invitedByName: string;
  workspaceName: string;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  deliveryStatus: "pending" | "sent" | "failed";
  createdAt: string;
};

type FakeStore = {
  workspaces: Map<string, FakeWorkspace>;
  projects: ProjectSummary[];
  memberships: FakeMembership[];
  invitations: FakeInvitation[];
};

const FAKE_STORE_KEY = Symbol.for("meld.e2e-workspace-store");
const E2E_WORKSPACE_ID =
  "00000000-0000-4000-8000-000000000001";
const E2E_OWNER_ID = "10000000-0000-4000-8000-000000000001";
// Two more seeded members of the same workspace. There is no UI for adding
// a room participant (see e2e/room.spec.ts), so a browser spec that
// needs a second person in the seeded room -- a collaborator reading a shared
// exchange, or a view-only participant -- can only get one from the seed.
// Their room access is decided in the room fake, which imports these ids.
export const E2E_TEAMMATE_ID = "10000000-0000-4000-8000-000000000002";
export const E2E_TEAMMATE_EMAIL = "teammate@example.com";
export const E2E_VIEWER_ID = "10000000-0000-4000-8000-000000000003";
export const E2E_VIEWER_EMAIL = "viewer@example.com";

// Gives direct-route browser specs a stable authenticated workspace shell.
// Tests that exercise onboarding still create their own isolated workspaces.
function createFakeStore(): FakeStore {
  return {
    workspaces: new Map([
      [
        E2E_WORKSPACE_ID,
        {
          id: E2E_WORKSPACE_ID,
          name: "Meld E2E",
          projectId: "20000000-0000-4000-8000-000000000001",
          projectName: "Meld E2E product",
        },
      ],
    ]),
    projects: [
      {
        id: "20000000-0000-4000-8000-000000000001",
        workspaceId: E2E_WORKSPACE_ID,
        name: "Meld E2E product",
        createdBy: E2E_OWNER_ID,
      },
    ],
    memberships: [
      {
        workspaceId: E2E_WORKSPACE_ID,
        userId: E2E_OWNER_ID,
        email: "owner@example.com",
        role: "admin",
        productRole: null,
        createdAt: "2026-07-28T12:00:00.000Z",
      },
      {
        workspaceId: E2E_WORKSPACE_ID,
        userId: E2E_TEAMMATE_ID,
        email: E2E_TEAMMATE_EMAIL,
        role: "member",
        productRole: null,
        createdAt: "2026-07-28T12:01:00.000Z",
      },
      {
        workspaceId: E2E_WORKSPACE_ID,
        userId: E2E_VIEWER_ID,
        email: E2E_VIEWER_EMAIL,
        role: "member",
        productRole: null,
        createdAt: "2026-07-28T12:02:00.000Z",
      },
    ],
    invitations: [],
  };
}

function getStore() {
  const globalState = globalThis as typeof globalThis & {
    [FAKE_STORE_KEY]?: FakeStore;
  };

  globalState[FAKE_STORE_KEY] ??= createFakeStore();

  return globalState[FAKE_STORE_KEY];
}

export { isWorkspaceFakeEnabled };

export async function getFakeUser(): Promise<FakeUser | null> {
  if (!isWorkspaceFakeEnabled()) {
    return null;
  }

  const cookieStore = await cookies();
  const id = cookieStore.get("meld-e2e-user-id")?.value;
  const email = cookieStore
    .get("meld-e2e-user-email")
    ?.value.trim()
    .toLowerCase();
  const name = cookieStore.get("meld-e2e-user-name")?.value;

  if (!id || !email) {
    return null;
  }

  return { id, email, name: name || email };
}

async function requireFakeUser() {
  const user = await getFakeUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}

function requireFakeAdmin(workspaceId: string, userId: string) {
  const membership = getStore().memberships.find(
    (candidate) =>
      candidate.workspaceId === workspaceId &&
      candidate.userId === userId &&
      candidate.role === "admin",
  );

  if (!membership) {
    throw new Error("Only workspace admins can invite members");
  }
}

export async function fakeRemoveWorkspaceMember(input: {
  workspaceId: string;
  userId: string;
}) {
  const user = await requireFakeUser();
  requireFakeAdmin(input.workspaceId, user.id);
  if (input.userId === user.id) {
    throw new Error("Workspace admins cannot remove themselves");
  }
  const store = getStore();
  const membershipIndex = store.memberships.findIndex(
    (candidate) =>
      candidate.workspaceId === input.workspaceId &&
      candidate.userId === input.userId,
  );
  if (membershipIndex < 0) {
    throw new Error("Workspace member not found");
  }
  store.memberships.splice(membershipIndex, 1);
}

export async function fakeCreateWorkspace(input: WorkspaceInput) {
  const user = await requireFakeUser();
  const store = getStore();
  const workspace: FakeWorkspace = {
    id: randomUUID(),
    name: input.name,
    logoPath: input.logoPath,
    projectId: randomUUID(),
    projectName: input.projectName,
  };
  store.workspaces.set(workspace.id, workspace);
  store.projects.push({
    id: workspace.projectId,
    workspaceId: workspace.id,
    name: workspace.projectName,
    createdBy: user.id,
  });
  store.memberships.push({
    workspaceId: workspace.id,
    userId: user.id,
    email: user.email,
    role: "admin",
    productRole: null,
    createdAt: new Date().toISOString(),
  });

  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    workspaceLogoPath: workspace.logoPath ?? null,
    projectId: workspace.projectId,
    projectName: workspace.projectName,
  };
}

export async function listFakeWorkspaceProjects(
  workspaceId: string,
): Promise<ProjectSummary[]> {
  const context = await getFakeWorkspaceContext(workspaceId);
  if (!context) {
    throw new Error("Authentication required");
  }
  return getStore().projects.filter(
    (project) => project.workspaceId === workspaceId,
  );
}

export function fakeWorkspaceHasProject(
  workspaceId: string,
  projectId: string,
) {
  return getStore().projects.some(
    (project) =>
      project.id === projectId && project.workspaceId === workspaceId,
  );
}

export async function fakeCreateProject(
  input: CreateProjectInput,
): Promise<ProjectSummary> {
  const user = await requireFakeUser();
  requireFakeAdmin(input.workspaceId, user.id);
  const project = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    name: input.name,
    createdBy: user.id,
  };
  getStore().projects.push(project);
  return project;
}

export async function fakeRenameProject(
  input: RenameProjectInput,
): Promise<ProjectSummary> {
  const user = await requireFakeUser();
  requireFakeAdmin(input.workspaceId, user.id);
  const project = getStore().projects.find(
    (candidate) =>
      candidate.id === input.projectId &&
      candidate.workspaceId === input.workspaceId,
  );
  if (!project) {
    throw new Error("We could not rename the project.");
  }
  project.name = input.name;
  return project;
}

export async function fakeDeleteProject(
  input: ProjectReference,
): Promise<void> {
  const user = await requireFakeUser();
  requireFakeAdmin(input.workspaceId, user.id);
  const store = getStore();
  const index = store.projects.findIndex(
    (candidate) =>
      candidate.id === input.projectId &&
      candidate.workspaceId === input.workspaceId,
  );
  if (index < 0) {
    throw new Error("We could not delete the project.");
  }
  store.projects.splice(index, 1);
}

export async function fakeInviteMember(input: InviteInput) {
  const user = await requireFakeUser();
  requireFakeAdmin(input.workspaceId, user.id);
  const store = getStore();
  const workspace = store.workspaces.get(input.workspaceId);

  if (!workspace) {
    throw new Error("We could not create the invitation.");
  }

  const now = new Date();
  const activeInvitation = store.invitations.find(
    (invitation) =>
      invitation.workspaceId === input.workspaceId &&
      invitation.email === input.email &&
      !invitation.acceptedAt &&
      !invitation.revokedAt,
  );

  if (activeInvitation) {
    throw new Error(
      "An active invitation already exists; revoke it before creating another",
    );
  }

  const invitationId = randomUUID();
  const token = deriveInvitationToken(
    invitationId,
    readInvitationTokenSecret(),
  );
  const expiresAt = new Date(
    now.getTime() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  store.invitations.push({
    id: invitationId,
    workspaceId: input.workspaceId,
    email: input.email,
    productRole: input.productRole,
    invitedBy: user.id,
    invitedByName: user.name,
    workspaceName: workspace.name,
    tokenHash: hashInvitationToken(token),
    expiresAt,
    acceptedAt: null,
    revokedAt: null,
    deliveryStatus: "sent",
    createdAt: now.toISOString(),
  });

  return {
    invitationId,
    email: input.email,
    productRole: input.productRole,
    expiresAt,
    deliveryStatus: "sent" as const,
    retryable: false,
  };
}

export async function fakeRetryInvitationDelivery(
  input: InvitationReference,
) {
  const user = await requireFakeUser();
  requireFakeAdmin(input.workspaceId, user.id);
  const invitation = getStore().invitations.find(
    (candidate) =>
      candidate.id === input.invitationId &&
      candidate.workspaceId === input.workspaceId,
  );
  const token = deriveInvitationToken(
    input.invitationId,
    readInvitationTokenSecret(),
  );

  if (
    !invitation ||
    invitation.tokenHash !== hashInvitationToken(token) ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    !["pending", "failed"].includes(invitation.deliveryStatus) ||
    new Date(invitation.expiresAt).getTime() <= Date.now()
  ) {
    throw new Error("Invitation token verification failed");
  }

  invitation.deliveryStatus = "sent";
  return {
    invitationId: invitation.id,
    email: invitation.email,
    deliveryStatus: "sent" as const,
    retryable: false,
  };
}

export async function fakeRevokeInvitation(
  input: InvitationReference,
) {
  const user = await requireFakeUser();
  requireFakeAdmin(input.workspaceId, user.id);
  const invitation = getStore().invitations.find(
    (candidate) =>
      candidate.id === input.invitationId &&
      candidate.workspaceId === input.workspaceId &&
      !candidate.acceptedAt &&
      !candidate.revokedAt,
  );

  if (!invitation) {
    throw new Error("Active invitation not found");
  }
  invitation.revokedAt = new Date().toISOString();
}

export async function fakeAcceptInvitation(token: string) {
  const user = await requireFakeUser();
  const store = getStore();
  const tokenHash = hashInvitationToken(token);
  const invitation = store.invitations.find(
    (candidate) => candidate.tokenHash === tokenHash,
  );

  if (
    !invitation ||
    invitation.revokedAt ||
    new Date(invitation.expiresAt).getTime() <= Date.now()
  ) {
    throw new Error("Invitation is invalid, expired, or already used");
  }
  if (invitation.email !== user.email) {
    throw new Error("Invitation email does not match authenticated user");
  }

  const alreadyMember = store.memberships.some(
    (membership) =>
      membership.workspaceId === invitation.workspaceId &&
      membership.userId === user.id,
  );

  if (invitation.acceptedAt && !alreadyMember) {
    throw new Error("Invitation is invalid, expired, or already used");
  }

  if (!alreadyMember) {
    store.memberships.push({
      workspaceId: invitation.workspaceId,
      userId: user.id,
      email: user.email,
      role: "member",
      productRole: invitation.productRole,
      createdAt: new Date().toISOString(),
    });
  }
  invitation.acceptedAt ??= new Date().toISOString();
  const workspace = store.workspaces.get(
    invitation.workspaceId,
  );

  if (!workspace) {
    throw new Error("We could not accept the invitation.");
  }
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.name,
  };
}

export async function getFakeWorkspaceContext(
  workspaceId: string,
) {
  const user = await getFakeUser();
  if (!user) {
    return null;
  }
  const store = getStore();
  const membership = store.memberships.find(
    (candidate) =>
      candidate.workspaceId === workspaceId &&
      candidate.userId === user.id,
  );
  const workspace = store.workspaces.get(workspaceId);

  if (!membership || !workspace) {
    return null;
  }
  return { user, membership, workspace };
}

export async function listFakeUserWorkspaces() {
  const user = await getFakeUser();
  if (!user) {
    return [];
  }
  const store = getStore();
  return store.memberships
    .filter((membership) => membership.userId === user.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((membership) => {
      const workspace = store.workspaces.get(
        membership.workspaceId,
      );
      return {
        workspaceId: membership.workspaceId,
        workspaceName: workspace?.name ?? "",
        // No object storage behind the fake, so no logo to link to.
        workspaceLogoUrl: null,
      };
    });
}

export async function listFakeWorkspacePeople(
  workspaceId: string,
) {
  const context = await getFakeWorkspaceContext(workspaceId);
  if (!context) {
    return null;
  }
  const store = getStore();
  return {
    isAdmin: context.membership.role === "admin",
    members: store.memberships
      .filter(
        (membership) =>
          membership.workspaceId === workspaceId,
      )
      .map((membership) => ({
        user_id: membership.userId,
        email: membership.email,
        role: membership.role,
        product_role: membership.productRole,
        created_at: membership.createdAt,
      })),
    invitations:
      context.membership.role === "admin"
        ? store.invitations
            .filter(
              (invitation) =>
                invitation.workspaceId === workspaceId,
            )
            .map((invitation) => ({
              id: invitation.id,
              email: invitation.email,
              product_role: invitation.productRole,
              expires_at: invitation.expiresAt,
              accepted_at: invitation.acceptedAt,
              revoked_at: invitation.revokedAt,
              delivery_status: invitation.deliveryStatus,
            }))
        : [],
  };
}
