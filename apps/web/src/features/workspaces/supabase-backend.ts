import "server-only";

import { randomUUID } from "node:crypto";
import { unstable_noStore as noStore } from "next/cache";
import { getApplicationOrigin } from "@/lib/application-origin";
import type {
  InvitationRecord as OrganizationInvitationRecord,
  MembershipRecord,
  OrganizationLogoUpload,
  OrganizationSummary,
  WorkspaceBackend,
} from "./backend";
import { createClient } from "@/lib/supabase/server";
import { sendInvitationEmail } from "./invitation-email";
import {
  deriveInvitationToken,
  hashInvitationToken,
  readInvitationTokenSecret,
} from "./invitation-token";

const ORGANIZATION_LOGO_BUCKET = "organization-logos";

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
  organization_logo_path?: string | null;
  product_id: string;
  product_name: string;
};

type InvitationRecord = {
  invitation_id: string;
  organization_name: string;
  invited_by_name?: string;
  email: string;
  product_role?: string | null;
  expires_at?: string;
  delivery_status?: "pending" | "sent" | "failed";
  token_hash_matches?: boolean;
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

export async function getAuthenticatedContext() {
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

async function safelyMarkInvitationDelivery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    organizationId: string;
    invitationId: string;
    status: "sent" | "failed";
    providerId?: string;
  },
) {
  try {
    return await markInvitationDelivery(supabase, input);
  } catch {
    return {
      data: null,
      error: { message: "Invitation delivery status could not be saved." },
    };
  }
}

function readFinalDeliveryStatus(
  data: unknown,
  requestedStatus: "sent" | "failed",
) {
  const value = asRecord(data);
  return value === "sent" || value === "failed"
    ? value
    : requestedStatus;
}

async function deliverInvitation(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  organizationId: string;
  record: InvitationRecord;
  token: string;
  invitedByName: string;
  failedMessage: string;
}) {
  let delivery: Awaited<ReturnType<typeof attemptInvitationDelivery>>;

  try {
    delivery = await attemptInvitationDelivery({
      acceptUrl: createAcceptUrl(input.token),
      email: input.record.email,
      invitationId: input.record.invitation_id,
      invitedByName: input.invitedByName,
      organizationName: input.record.organization_name,
    });
  } catch {
    const marked = await safelyMarkInvitationDelivery(input.supabase, {
      organizationId: input.organizationId,
      invitationId: input.record.invitation_id,
      status: "failed",
    });

    if (marked.error) {
      return {
        deliveryStatus: "pending" as const,
        retryable: true,
        message:
          "Email delivery failed and its status could not be saved. Retry the same invitation.",
      };
    }

    const deliveryStatus = readFinalDeliveryStatus(marked.data, "failed");
    return {
      deliveryStatus,
      retryable: deliveryStatus !== "sent",
      message:
        deliveryStatus === "sent" ? undefined : input.failedMessage,
    };
  }

  const marked = await safelyMarkInvitationDelivery(input.supabase, {
    organizationId: input.organizationId,
    invitationId: input.record.invitation_id,
    status: "sent",
    providerId: delivery.providerId,
  });

  if (marked.error) {
    return {
      deliveryStatus: "pending" as const,
      retryable: true,
      message:
        "The invitation email may have been sent, but delivery status could not be saved. Retry the same invitation.",
    };
  }

  const deliveryStatus = readFinalDeliveryStatus(marked.data, "sent");
  return {
    deliveryStatus,
    retryable: deliveryStatus !== "sent",
    message:
      deliveryStatus === "sent"
        ? undefined
        : "Delivery status remains retryable. Retry the same invitation.",
  };
}

function createAcceptUrl(token: string) {
  return new URL(
    `/invitations/${encodeURIComponent(token)}`,
    getApplicationOrigin(),
  ).toString();
}

const ORGANIZATION_LOGO_PUBLIC_BUCKET = "organization-logos";

type WorkspaceMembershipRow = {
  organizations: {
    id: string;
    name: string;
    logo_path: string | null;
  };
};

export function createSupabaseWorkspaceBackend(): WorkspaceBackend {
  return {
    async getCurrentUserId() {
      const supabase = await createClient(new Headers());
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user?.id ?? null;
    },

    async listUserWorkspaces() {
      const supabase = await createClient(new Headers());
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("memberships")
        .select("organizations(id,name,logo_path)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        throw new Error("We could not load your workspaces.");
      }

      return ((data ?? []) as unknown as WorkspaceMembershipRow[]).map((row) => ({
        organizationId: row.organizations.id,
        organizationName: row.organizations.name,
        organizationLogoUrl: row.organizations.logo_path
          ? supabase.storage
              .from(ORGANIZATION_LOGO_PUBLIC_BUCKET)
              .getPublicUrl(row.organizations.logo_path).data.publicUrl
          : null,
      }));
    },

    async getOrganizationShell(organizationId) {
      const supabase = await createClient(new Headers());
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { status: "unauthenticated" };

      const [membershipResult, organizationResult] = await Promise.all([
        supabase
          .from("memberships")
          .select("role")
          .eq("organization_id", organizationId)
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("organizations")
          .select("name")
          .eq("id", organizationId)
          .maybeSingle(),
      ]);
      const organization = organizationResult.data;
      if (!membershipResult.data || !organization) {
        return { status: "not-a-member" };
      }

      return {
        status: "ok",
        data: {
          currentUserId: user.id,
          organizationName: organization.name,
        },
      };
    },

    async getOrganizationPeople(organizationId) {
      const supabase = await createClient(new Headers());
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { status: "unauthenticated" };

      const { data: currentMembership } = await supabase
        .from("memberships")
        .select("role")
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!currentMembership) return { status: "not-a-member" };

      const isAdmin = currentMembership.role === "admin";
      const { data: memberData, error: membersError } =
        await supabase.rpc("list_organization_members", {
          target_organization_id: organizationId,
        });
      const invitationResult = isAdmin
        ? await supabase
            .from("invitations")
            .select(
              "id,email,product_role,expires_at,accepted_at,revoked_at,delivery_status",
            )
            .eq("organization_id", organizationId)
            .order("created_at")
        : { data: [], error: null };

      if (membersError || invitationResult.error) {
        throw new Error("We could not load organization members.");
      }

      return {
        status: "ok",
        data: {
          isAdmin,
          members: (memberData ?? []) as MembershipRecord[],
          invitations: (invitationResult.data ??
            []) as OrganizationInvitationRecord[],
        },
      };
    },

    async uploadOrganizationLogo(
      logo,
      extension,
    ): Promise<OrganizationLogoUpload> {
      let context: Awaited<ReturnType<typeof getAuthenticatedContext>>;
      try {
        context = await getAuthenticatedContext();
      } catch {
        return { status: "unauthenticated" };
      }

      const logoPath = `${context.user.id}/${randomUUID()}.${extension}`;
      const storage = context.supabase.storage.from(
        ORGANIZATION_LOGO_BUCKET,
      );

      let logoBytes: Uint8Array;
      try {
        logoBytes = new Uint8Array(await logo.arrayBuffer());
      } catch {
        return { status: "upload-failed" };
      }

      try {
        const upload = await storage.upload(logoPath, logoBytes, {
          contentType: logo.type,
          upsert: false,
        });
        if (upload.error) {
          return { status: "upload-failed" };
        }
      } catch {
        return { status: "upload-failed" };
      }

      return { status: "ok", logoPath };
    },

    async removeOrganizationLogo(logoPath) {
      try {
        const { supabase } = await getAuthenticatedContext();
        await supabase.storage
          .from(ORGANIZATION_LOGO_BUCKET)
          .remove([logoPath]);
      } catch {
        // Cleanup is best-effort; preserve the original creation error.
      }
    },

    async createOrganization(input): Promise<OrganizationSummary> {
      const { supabase } = await getAuthenticatedContext();
      const { data, error } = await supabase.rpc(
        "create_organization_with_product",
        {
          organization_name: input.name,
          organization_logo_path: input.logoPath ?? null,
          product_name: input.productName,
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
        organizationLogoPath: record.organization_logo_path ?? null,
        productId: record.product_id,
        productName: record.product_name,
      };
    },

    async inviteMember(input) {
      const { supabase, user } = await getAuthenticatedContext();
      const invitationId = randomUUID();
      const token = deriveInvitationToken(
        invitationId,
        readInvitationTokenSecret(),
      );
      const tokenHash = hashInvitationToken(token);
      const invitedByName = getInvitedByName(user);
      const { data, error } = await supabase.rpc("create_invitation", {
        target_organization_id: input.organizationId,
        invitee_email: input.email,
        invitation_id: invitationId,
        invitation_token_hash: tokenHash,
        inviter_display_name: invitedByName,
        invitee_product_role: input.productRole,
      });

      if (error) {
        throwDatabaseError(error, "We could not create the invitation.");
      }

      const record = asRecord(data) as InvitationRecord | null;
      if (!record) {
        throw new Error("We could not create the invitation.");
      }

      const delivery = await deliverInvitation({
        supabase,
        organizationId: input.organizationId,
        record,
        token,
        invitedByName: record.invited_by_name ?? invitedByName,
        failedMessage:
          "The invitation is saved, but email delivery failed. Retry the same invitation.",
      });

      return {
        invitationId: record.invitation_id,
        email: record.email,
        productRole: record.product_role ?? input.productRole,
        expiresAt: record.expires_at,
        ...delivery,
      };
    },

    async retryInvitationDelivery(input) {
      const { supabase, user } = await getAuthenticatedContext();
      const token = deriveInvitationToken(
        input.invitationId,
        readInvitationTokenSecret(),
      );
      const tokenHash = hashInvitationToken(token);
      const { data, error } = await supabase.rpc(
        "authorize_invitation_delivery",
        {
          target_organization_id: input.organizationId,
          invitation_id: input.invitationId,
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

      const delivery = await deliverInvitation({
        supabase,
        organizationId: input.organizationId,
        record,
        token,
        invitedByName:
          record.invited_by_name ?? getInvitedByName(user),
        failedMessage:
          "Email delivery failed again. You can retry this invitation.",
      });

      return {
        invitationId: record.invitation_id,
        email: record.email,
        ...delivery,
      };
    },

    async revokeInvitation(input) {
      const { supabase } = await getAuthenticatedContext();
      const { error } = await supabase.rpc("revoke_invitation", {
        target_organization_id: input.organizationId,
        invitation_id: input.invitationId,
      });

      if (error) {
        throwDatabaseError(error, "We could not revoke the invitation.");
      }
    },

    async acceptInvitation(token) {
      const { supabase } = await getAuthenticatedContext();
      const { data, error } = await supabase.rpc("accept_invitation", {
        invitation_token: token,
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
    },
  };
}
