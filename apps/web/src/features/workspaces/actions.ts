"use server";

import { randomUUID } from "node:crypto";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getApplicationOrigin } from "../../lib/application-origin";
import { sendInvitationEmail } from "./invitation-email";
import {
  deriveInvitationToken,
  hashInvitationToken,
  readInvitationTokenSecret,
} from "./invitation-token";
import {
  InvitationReferenceSchema,
  InvitationTokenSchema,
  InviteInputSchema,
  OrganizationInputSchema,
  type InvitationReference,
  type InviteInput,
  type OrganizationInput,
} from "./schemas";

type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

type DatabaseError = {
  message?: string;
};

type OrganizationRecord = {
  organization_id: string;
  organization_name: string;
  product_id: string;
  product_name: string;
};

type InvitationRecord = {
  invitation_id: string;
  organization_name: string;
  email: string;
  expires_at?: string;
  token_hash_matches?: boolean;
};

export type WorkspaceFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  organizationId?: string;
  invitationId?: string;
  retryable?: boolean;
  fieldErrors?: {
    name?: string;
    productName?: string;
    email?: string;
  };
};

const ALLOWED_DATABASE_MESSAGES = new Set([
  "Active invitation not found",
  "An active invitation already exists; revoke it before creating another",
  "Invitation email does not match authenticated user",
  "Invitation is invalid, expired, or already used",
  "Invitation token verification failed",
  "Only organization admins can invite members",
  "Only organization admins can retry invitations",
  "Only organization admins can revoke invitations",
  "This person is already an organization member",
]);

function isE2EFakeEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.MELD_E2E_FAKE_WORKSPACES === "true"
  );
}

function asRecord<T>(data: T | T[] | null) {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

function throwDatabaseError(
  error: DatabaseError,
  fallback: string,
): never {
  const message =
    error.message && ALLOWED_DATABASE_MESSAGES.has(error.message)
      ? error.message
      : fallback;
  throw new Error(message);
}

async function getAuthenticatedContext() {
  noStore();
  const supabase = await createClient(new Headers());
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Authentication required");
  }

  return { supabase, user: user as SupabaseUser };
}

function getInvitedByName(user: SupabaseUser) {
  const fullName = user.user_metadata?.full_name;
  const name = user.user_metadata?.name;

  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }
  return user.email ?? "A teammate";
}

async function attemptInvitationDelivery(input: {
  acceptUrl: string;
  email: string;
  invitationId: string;
  invitedByName: string;
  organizationName: string;
}) {
  const emailInput = {
    to: input.email,
    organizationName: input.organizationName,
    invitedByName: input.invitedByName,
    acceptUrl: input.acceptUrl,
    idempotencyKey: `invitation/${input.invitationId}`,
  };

  try {
    return await sendInvitationEmail(emailInput);
  } catch {
    return sendInvitationEmail(emailInput);
  }
}

async function markInvitationDelivery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    organizationId: string;
    invitationId: string;
    status: "sent" | "failed";
    providerId?: string;
  },
) {
  return supabase.rpc("mark_invitation_delivery", {
    target_organization_id: input.organizationId,
    invitation_id: input.invitationId,
    delivery_status: input.status,
    provider_message_id: input.providerId ?? null,
  });
}

function createAcceptUrl(token: string) {
  return new URL(
    `/invitations/${encodeURIComponent(token)}`,
    getApplicationOrigin(),
  ).toString();
}

export async function createOrganization(input: OrganizationInput) {
  const parsed = OrganizationInputSchema.parse(input);
  if (isE2EFakeEnabled()) {
    const { fakeCreateOrganization } = await import("./e2e-fake");
    return fakeCreateOrganization(parsed);
  }
  const { supabase } = await getAuthenticatedContext();
  const { data, error } = await supabase.rpc(
    "create_organization_with_product",
    {
      organization_name: parsed.name,
      product_name: parsed.productName,
    },
  );

  if (error) {
    throwDatabaseError(error, "We could not create the organization.");
  }

  const record = asRecord(data) as OrganizationRecord | null;
  if (!record) {
    throw new Error("We could not create the organization.");
  }

  return {
    organizationId: record.organization_id,
    organizationName: record.organization_name,
    productId: record.product_id,
    productName: record.product_name,
  };
}

export async function inviteMember(input: InviteInput) {
  const parsed = InviteInputSchema.parse(input);
  if (isE2EFakeEnabled()) {
    const { fakeInviteMember } = await import("./e2e-fake");
    return fakeInviteMember(parsed);
  }
  const { supabase, user } = await getAuthenticatedContext();
  const invitationId = randomUUID();
  const token = deriveInvitationToken(
    invitationId,
    readInvitationTokenSecret(),
  );
  const tokenHash = hashInvitationToken(token);
  const { data, error } = await supabase.rpc("create_invitation", {
    target_organization_id: parsed.organizationId,
    invitee_email: parsed.email,
    invitation_id: invitationId,
    invitation_token_hash: tokenHash,
  });

  if (error) {
    throwDatabaseError(error, "We could not create the invitation.");
  }

  const record = asRecord(data) as InvitationRecord | null;
  if (!record) {
    throw new Error("We could not create the invitation.");
  }

  try {
    const delivery = await attemptInvitationDelivery({
      acceptUrl: createAcceptUrl(token),
      email: record.email,
      invitationId: record.invitation_id,
      invitedByName: getInvitedByName(user),
      organizationName: record.organization_name,
    });
    const marked = await markInvitationDelivery(supabase, {
      organizationId: parsed.organizationId,
      invitationId: record.invitation_id,
      status: "sent",
      providerId: delivery.providerId,
    });

    if (marked.error) {
      throw new Error("Invitation delivery status could not be saved.");
    }

    return {
      invitationId: record.invitation_id,
      email: record.email,
      expiresAt: record.expires_at,
      deliveryStatus: "sent" as const,
      retryable: false,
    };
  } catch {
    await markInvitationDelivery(supabase, {
      organizationId: parsed.organizationId,
      invitationId: record.invitation_id,
      status: "failed",
    });

    return {
      invitationId: record.invitation_id,
      email: record.email,
      expiresAt: record.expires_at,
      deliveryStatus: "failed" as const,
      retryable: true,
      message:
        "The invitation is saved, but email delivery failed. Retry the same invitation.",
    };
  }
}

export async function retryInvitationDelivery(
  input: InvitationReference,
) {
  const parsed = InvitationReferenceSchema.parse(input);
  if (isE2EFakeEnabled()) {
    const { fakeRetryInvitationDelivery } = await import("./e2e-fake");
    return fakeRetryInvitationDelivery(parsed);
  }
  const { supabase, user } = await getAuthenticatedContext();
  const token = deriveInvitationToken(
    parsed.invitationId,
    readInvitationTokenSecret(),
  );
  const tokenHash = hashInvitationToken(token);
  const { data, error } = await supabase.rpc(
    "authorize_invitation_delivery",
    {
      target_organization_id: parsed.organizationId,
      invitation_id: parsed.invitationId,
      invitation_token_hash: tokenHash,
    },
  );

  if (error) {
    throwDatabaseError(error, "We could not retry the invitation.");
  }

  const record = asRecord(data) as InvitationRecord | null;
  if (!record?.token_hash_matches) {
    throw new Error("Invitation token verification failed");
  }

  try {
    const delivery = await attemptInvitationDelivery({
      acceptUrl: createAcceptUrl(token),
      email: record.email,
      invitationId: record.invitation_id,
      invitedByName: getInvitedByName(user),
      organizationName: record.organization_name,
    });
    const marked = await markInvitationDelivery(supabase, {
      organizationId: parsed.organizationId,
      invitationId: record.invitation_id,
      status: "sent",
      providerId: delivery.providerId,
    });

    if (marked.error) {
      throw new Error("Invitation delivery status could not be saved.");
    }

    return {
      invitationId: record.invitation_id,
      email: record.email,
      deliveryStatus: "sent" as const,
      retryable: false,
    };
  } catch {
    await markInvitationDelivery(supabase, {
      organizationId: parsed.organizationId,
      invitationId: record.invitation_id,
      status: "failed",
    });

    return {
      invitationId: record.invitation_id,
      email: record.email,
      deliveryStatus: "failed" as const,
      retryable: true,
      message: "Email delivery failed again. You can retry this invitation.",
    };
  }
}

export async function revokeInvitation(input: InvitationReference) {
  const parsed = InvitationReferenceSchema.parse(input);
  if (isE2EFakeEnabled()) {
    const { fakeRevokeInvitation } = await import("./e2e-fake");
    return fakeRevokeInvitation(parsed);
  }
  const { supabase } = await getAuthenticatedContext();
  const { error } = await supabase.rpc("revoke_invitation", {
    target_organization_id: parsed.organizationId,
    invitation_id: parsed.invitationId,
  });

  if (error) {
    throwDatabaseError(error, "We could not revoke the invitation.");
  }
}

export async function acceptInvitation(token: string) {
  const parsed = InvitationTokenSchema.parse(token);
  if (isE2EFakeEnabled()) {
    const { fakeAcceptInvitation } = await import("./e2e-fake");
    return fakeAcceptInvitation(parsed);
  }
  const { supabase } = await getAuthenticatedContext();
  const { data, error } = await supabase.rpc("accept_invitation", {
    invitation_token: parsed,
  });

  if (error) {
    throwDatabaseError(error, "We could not accept the invitation.");
  }

  const record = asRecord(data) as Pick<
    OrganizationRecord,
    "organization_id" | "organization_name"
  > | null;
  if (!record) {
    throw new Error("We could not accept the invitation.");
  }

  return {
    organizationId: record.organization_id,
    organizationName: record.organization_name,
  };
}

export async function createOrganizationFromForm(
  _previousState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const parsed = OrganizationInputSchema.safeParse({
    name: formData.get("name"),
    productName: formData.get("productName"),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: {
        name: errors.name?.[0],
        productName: errors.productName?.[0],
      },
    };
  }

  try {
    const organization = await createOrganization(parsed.data);
    return {
      status: "success",
      message: `${organization.organizationName} is ready.`,
      organizationId: organization.organizationId,
    };
  } catch {
    return {
      status: "error",
      message: "We could not create the organization. Please try again.",
      retryable: true,
    };
  }
}

export async function inviteMemberFromForm(
  _previousState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const parsed = InviteInputSchema.safeParse({
    organizationId: formData.get("organizationId"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a valid email address.",
      fieldErrors: {
        email: parsed.error.flatten().fieldErrors.email?.[0],
      },
    };
  }

  try {
    const invitation = await inviteMember(parsed.data);
    return {
      status:
        invitation.deliveryStatus === "sent" ? "success" : "error",
      message:
        invitation.deliveryStatus === "sent"
          ? `Invitation sent to ${invitation.email}.`
          : invitation.message,
      organizationId: parsed.data.organizationId,
      invitationId: invitation.invitationId,
      retryable: invitation.retryable,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "We could not create the invitation.",
    };
  }
}

export async function retryInvitationDeliveryFromForm(
  _previousState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const parsed = InvitationReferenceSchema.safeParse({
    organizationId: formData.get("organizationId"),
    invitationId: formData.get("invitationId"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "The invitation reference is invalid.",
    };
  }

  try {
    const result = await retryInvitationDelivery(parsed.data);
    return {
      status: result.deliveryStatus === "sent" ? "success" : "error",
      message:
        result.deliveryStatus === "sent"
          ? `Invitation sent to ${result.email}.`
          : result.message,
      organizationId: parsed.data.organizationId,
      invitationId: parsed.data.invitationId,
      retryable: result.retryable,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "We could not retry the invitation.",
    };
  }
}

export async function revokeInvitationFromForm(
  _previousState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const parsed = InvitationReferenceSchema.safeParse({
    organizationId: formData.get("organizationId"),
    invitationId: formData.get("invitationId"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "The invitation reference is invalid.",
    };
  }

  try {
    await revokeInvitation(parsed.data);
    return {
      status: "success",
      message: "Invitation revoked.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "We could not revoke the invitation.",
    };
  }
}

export async function acceptInvitationFromForm(
  _previousState: WorkspaceFormState,
  formData: FormData,
): Promise<WorkspaceFormState> {
  const token = formData.get("token");
  if (typeof token !== "string") {
    return {
      status: "error",
      message: "The invitation link is invalid.",
    };
  }

  try {
    const organization = await acceptInvitation(token);
    return {
      status: "success",
      message: `You joined ${organization.organizationName}.`,
      organizationId: organization.organizationId,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "We could not accept the invitation.",
    };
  }
}
