import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import {
  deriveInvitationToken,
  hashInvitationToken,
  readInvitationTokenSecret,
} from "./invitation-token";
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
  productId: string;
  productName: string;
};

type FakeMembership = {
  organizationId: string;
  userId: string;
  email: string;
  role: "admin" | "member";
  createdAt: string;
};

type FakeInvitation = {
  id: string;
  organizationId: string;
  email: string;
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

function getStore() {
  const globalState = globalThis as typeof globalThis & {
    [FAKE_STORE_KEY]?: FakeStore;
  };

  globalState[FAKE_STORE_KEY] ??= {
    organizations: new Map(),
    memberships: [],
    invitations: [],
  };

  return globalState[FAKE_STORE_KEY];
}

export function isWorkspaceFakeEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MELD_E2E_FAKE_WORKSPACES === "true"
  );
}

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

export async function fakeCreateOrganization(input: OrganizationInput) {
  const user = await requireFakeUser();
  const store = getStore();
  const organization: FakeOrganization = {
    id: randomUUID(),
    name: input.name,
    productId: randomUUID(),
    productName: input.productName,
  };
  store.organizations.set(organization.id, organization);
  store.memberships.push({
    organizationId: organization.id,
    userId: user.id,
    email: user.email,
    role: "admin",
    createdAt: new Date().toISOString(),
  });

  return {
    organizationId: organization.id,
    organizationName: organization.name,
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
  store.invitations
    .filter(
      (invitation) =>
        invitation.organizationId === input.organizationId &&
        invitation.email === input.email &&
        !invitation.acceptedAt &&
        !invitation.revokedAt &&
        new Date(invitation.expiresAt).getTime() <= now.getTime(),
    )
    .forEach((invitation) => {
      invitation.revokedAt = now.toISOString();
    });
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
    invitation.acceptedAt ||
    invitation.revokedAt ||
    new Date(invitation.expiresAt).getTime() <= Date.now()
  ) {
    throw new Error("Invitation is invalid, expired, or already used");
  }
  if (invitation.email !== user.email) {
    throw new Error("Invitation email does not match authenticated user");
  }

  if (
    !store.memberships.some(
      (membership) =>
        membership.organizationId === invitation.organizationId &&
        membership.userId === user.id,
    )
  ) {
    store.memberships.push({
      organizationId: invitation.organizationId,
      userId: user.id,
      email: user.email,
      role: "member",
      createdAt: new Date().toISOString(),
    });
  }
  invitation.acceptedAt = new Date().toISOString();
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
              expires_at: invitation.expiresAt,
              accepted_at: invitation.acceptedAt,
              revoked_at: invitation.revokedAt,
              delivery_status: invitation.deliveryStatus,
            }))
        : [],
  };
}
