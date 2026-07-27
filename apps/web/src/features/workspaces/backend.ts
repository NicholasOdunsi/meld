import "server-only";

import { isWorkspaceFakeEnabled } from "./e2e-gate";
import type {
  InvitationReference,
  InviteInput,
  OrganizationInput,
} from "./schemas";

// Workspace persistence and invitation delivery, behind one interface with
// two implementations: Supabase plus Resend in every real environment, an
// in-memory store under the e2e fake. The swap happens once, in
// getWorkspaceBackend below, instead of at every call site.

export const DEFAULT_PRODUCT_NAME = "Untitled product";
export const ORGANIZATION_LOGO_MAX_SIZE = 2 * 1024 * 1024;
export const ORGANIZATION_LOGO_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export type OrganizationSummary = {
  organizationId: string;
  organizationName: string;
  organizationLogoPath: string | null;
  productId: string;
  productName: string;
};

export type InvitationDelivery = {
  deliveryStatus: "pending" | "sent" | "failed";
  retryable: boolean;
  message?: string;
};

export type InvitationResult = InvitationDelivery & {
  invitationId: string;
  email: string;
  productRole?: string;
  expiresAt?: string;
};

// The three outcomes the create-organization form has to tell apart: a
// dead session and a failed upload produce different copy, so they stay
// distinguishable rather than collapsing into one thrown error.
export type OrganizationLogoUpload =
  | { status: "ok"; logoPath: string }
  | { status: "unauthenticated" }
  | { status: "upload-failed" };

export type MembershipRecord = {
  user_id: string;
  email: string;
  role: "admin" | "member";
  product_role: string | null;
  created_at: string;
};

export type InvitationRecord = {
  id: string;
  email: string;
  product_role: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  delivery_status: "pending" | "sent" | "failed";
};

export type OrganizationPeople = {
  isAdmin: boolean;
  members: MembershipRecord[];
  invitations: InvitationRecord[];
};

export type OrganizationShell = {
  currentUserId: string;
  organizationName: string;
  organizationLogoUrl: string | null;
};

// Signed-out and not-a-member stay distinct: callers send the first to
// sign-in and the second to notFound(), and collapsing them would leak
// which organization ids exist.
export type OrganizationAccess<T> =
  | { status: "unauthenticated" }
  | { status: "not-a-member" }
  | { status: "ok"; data: T };

export type WorkspaceBackend = {
  getCurrentUserId(): Promise<string | null>;
  getOrganizationShell(
    organizationId: string,
  ): Promise<OrganizationAccess<OrganizationShell>>;
  getOrganizationPeople(
    organizationId: string,
  ): Promise<OrganizationAccess<OrganizationPeople>>;
  uploadOrganizationLogo(
    logo: File,
    extension: string,
  ): Promise<OrganizationLogoUpload>;
  removeOrganizationLogo(logoPath: string): Promise<void>;
  createOrganization(
    input: OrganizationInput,
  ): Promise<OrganizationSummary>;
  inviteMember(input: InviteInput): Promise<InvitationResult>;
  retryInvitationDelivery(
    input: InvitationReference,
  ): Promise<InvitationResult>;
  revokeInvitation(input: InvitationReference): Promise<void>;
  acceptInvitation(token: string): Promise<{
    organizationId: string;
    organizationName: string;
  }>;
};

// The only place the e2e fake is selected. Both implementations are loaded
// lazily so the fake and its in-memory store stay out of the real bundle.
export async function getWorkspaceBackend(): Promise<WorkspaceBackend> {
  if (isWorkspaceFakeEnabled()) {
    const { createFakeWorkspaceBackend } = await import("./fake-backend");
    return createFakeWorkspaceBackend();
  }
  const { createSupabaseWorkspaceBackend } = await import(
    "./supabase-backend"
  );
  return createSupabaseWorkspaceBackend();
}
