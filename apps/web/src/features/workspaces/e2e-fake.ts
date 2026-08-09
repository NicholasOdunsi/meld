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
  OrganizationInput,
} from "./schemas";

type FakeUser = {
  id: string;
  email: string;
  name: string;
};

type FakeOrganization = {
  id: string;
  name: string;
  logoPath?: string;
  productId: string;
  productName: string;
};

type FakeMembership = {
  organizationId: string;
  userId: string;
  email: string;
  role: "admin" | "member";
  productRole: ProductRole | null;
  createdAt: string;
};

type FakeInvitation = {
  id: string;
  organizationId: string;
  email: string;
  productRole: ProductRole;
  invitedBy: string;
  invitedByName: string;
  organizationName: string;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  deliveryStatus: "pending" | "sent" | "failed";
  createdAt: string;
};

type FakeStore = {
  organizations: Map<string, FakeOrganization>;
  memberships: FakeMembership[];
  invitations: FakeInvitation[];
};

const FAKE_STORE_KEY = Symbol.for("meld.e2e-workspace-store");
const E2E_ORGANIZATION_ID =
  "00000000-0000-4000-8000-000000000001";
const E2E_OWNER_ID = "10000000-0000-4000-8000-000000000001";
// Two more seeded members of the same organization. There is no UI for adding
// a room participant (see e2e/discovery-room.spec.ts), so a browser spec that
// needs a second person in the seeded room -- a collaborator reading a shared
// exchange, or a view-only participant -- can only get one from the seed.
// Their room access is decided in the discovery fake, which imports these ids.
export const E2E_TEAMMATE_ID = "10000000-0000-4000-8000-000000000002";
export const E2E_TEAMMATE_EMAIL = "teammate@example.com";
export const E2E_VIEWER_ID = "10000000-0000-4000-8000-000000000003";
export const E2E_VIEWER_EMAIL = "viewer@example.com";

// Gives direct-route browser specs a stable authenticated organization shell.
// Tests that exercise onboarding still create their own isolated workspaces.
function createFakeStore(): FakeStore {
  return {
    organizations: new Map([
      [
        E2E_ORGANIZATION_ID,
        {
          id: E2E_ORGANIZATION_ID,
          name: "Meld E2E",
          productId: "20000000-0000-4000-8000-000000000001",
          productName: "Meld E2E product",
        },
      ],
    ]),
    memberships: [
      {
        organizationId: E2E_ORGANIZATION_ID,
        userId: E2E_OWNER_ID,
        email: "owner@example.com",
        role: "admin",
        productRole: null,
        createdAt: "2026-07-28T12:00:00.000Z",
      },
      {
        organizationId: E2E_ORGANIZATION_ID,
        userId: E2E_TEAMMATE_ID,
        email: E2E_TEAMMATE_EMAIL,
        role: "member",
        productRole: null,
        createdAt: "2026-07-28T12:01:00.000Z",
      },
      {
        organizationId: E2E_ORGANIZATION_ID,
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

function requireFakeAdmin(organizationId: string, userId: string) {
  const membership = getStore().memberships.find(
    (candidate) =>
      candidate.organizationId === organizationId &&
      candidate.userId === userId &&
      candidate.role === "admin",
  );

  if (!membership) {
    throw new Error("Only organization admins can invite members");
  }
}

export async function fakeRemoveOrganizationMember(input: {
  organizationId: string;
  userId: string;
}) {
  const user = await requireFakeUser();
  requireFakeAdmin(input.organizationId, user.id);
  if (input.userId === user.id) {
    throw new Error("Organization admins cannot remove themselves");
  }
  const store = getStore();
  const membershipIndex = store.memberships.findIndex(
    (candidate) =>
      candidate.organizationId === input.organizationId &&
      candidate.userId === input.userId,
  );
  if (membershipIndex < 0) {
    throw new Error("Organization member not found");
  }
  store.memberships.splice(membershipIndex, 1);
}

export async function fakeCreateOrganization(input: OrganizationInput) {
  const user = await requireFakeUser();
  const store = getStore();
  const organization: FakeOrganization = {
    id: randomUUID(),
    name: input.name,
    logoPath: input.logoPath,
    productId: randomUUID(),
    productName: input.productName,
  };
  store.organizations.set(organization.id, organization);
  store.memberships.push({
    organizationId: organization.id,
    userId: user.id,
    email: user.email,
    role: "admin",
    productRole: null,
    createdAt: new Date().toISOString(),
  });

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    organizationLogoPath: organization.logoPath ?? null,
    productId: organization.productId,
    productName: organization.productName,
  };
}

export async function fakeInviteMember(input: InviteInput) {
  const user = await requireFakeUser();
  requireFakeAdmin(input.organizationId, user.id);
  const store = getStore();
  const organization = store.organizations.get(input.organizationId);

  if (!organization) {
    throw new Error("We could not create the invitation.");
  }

  const now = new Date();
  const activeInvitation = store.invitations.find(
    (invitation) =>
      invitation.organizationId === input.organizationId &&
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
    organizationId: input.organizationId,
    email: input.email,
    productRole: input.productRole,
    invitedBy: user.id,
    invitedByName: user.name,
    organizationName: organization.name,
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
  requireFakeAdmin(input.organizationId, user.id);
  const invitation = getStore().invitations.find(
    (candidate) =>
      candidate.id === input.invitationId &&
      candidate.organizationId === input.organizationId,
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
  requireFakeAdmin(input.organizationId, user.id);
  const invitation = getStore().invitations.find(
    (candidate) =>
      candidate.id === input.invitationId &&
      candidate.organizationId === input.organizationId &&
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
      membership.organizationId === invitation.organizationId &&
      membership.userId === user.id,
  );

  if (invitation.acceptedAt && !alreadyMember) {
    throw new Error("Invitation is invalid, expired, or already used");
  }

  if (!alreadyMember) {
    store.memberships.push({
      organizationId: invitation.organizationId,
      userId: user.id,
      email: user.email,
      role: "member",
      productRole: invitation.productRole,
      createdAt: new Date().toISOString(),
    });
  }
  invitation.acceptedAt ??= new Date().toISOString();
  const organization = store.organizations.get(
    invitation.organizationId,
  );

  if (!organization) {
    throw new Error("We could not accept the invitation.");
  }
  return {
    organizationId: organization.id,
    organizationName: organization.name,
  };
}

export async function getFakeOrganizationContext(
  organizationId: string,
) {
  const user = await getFakeUser();
  if (!user) {
    return null;
  }
  const store = getStore();
  const membership = store.memberships.find(
    (candidate) =>
      candidate.organizationId === organizationId &&
      candidate.userId === user.id,
  );
  const organization = store.organizations.get(organizationId);

  if (!membership || !organization) {
    return null;
  }
  return { user, membership, organization };
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
      const organization = store.organizations.get(
        membership.organizationId,
      );
      return {
        organizationId: membership.organizationId,
        organizationName: organization?.name ?? "",
        // No object storage behind the fake, so no logo to link to.
        organizationLogoUrl: null,
      };
    });
}

export async function listFakeOrganizationPeople(
  organizationId: string,
) {
  const context = await getFakeOrganizationContext(organizationId);
  if (!context) {
    return null;
  }
  const store = getStore();
  return {
    isAdmin: context.membership.role === "admin",
    members: store.memberships
      .filter(
        (membership) =>
          membership.organizationId === organizationId,
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
                invitation.organizationId === organizationId,
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
