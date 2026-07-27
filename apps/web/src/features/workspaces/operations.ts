import "server-only";

import { getWorkspaceBackend } from "./backend";
import {
  InvitationReferenceSchema,
  InvitationTokenSchema,
  InviteInputSchema,
  OrganizationInputSchema,
  type InvitationReference,
  type InviteInput,
  type OrganizationInput,
} from "./schemas";

// Validation plus one call into the backend. Kept out of the "use server"
// module so that only the form wrappers callers actually invoke from the
// browser become endpoints.

export async function createOrganization(input: OrganizationInput) {
  const parsed = OrganizationInputSchema.parse(input);
  const backend = await getWorkspaceBackend();
  return backend.createOrganization(parsed);
}

export async function inviteMember(input: InviteInput) {
  const parsed = InviteInputSchema.parse(input);
  const backend = await getWorkspaceBackend();
  return backend.inviteMember(parsed);
}

export async function retryInvitationDelivery(
  input: InvitationReference,
) {
  const parsed = InvitationReferenceSchema.parse(input);
  const backend = await getWorkspaceBackend();
  return backend.retryInvitationDelivery(parsed);
}

export async function revokeInvitation(input: InvitationReference) {
  const parsed = InvitationReferenceSchema.parse(input);
  const backend = await getWorkspaceBackend();
  return backend.revokeInvitation(parsed);
}

export async function acceptInvitation(token: string) {
  const parsed = InvitationTokenSchema.parse(token);
  const backend = await getWorkspaceBackend();
  return backend.acceptInvitation(parsed);
}
