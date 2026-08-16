import "server-only";

import { getWorkspaceBackend } from "./backend";
import {
  InvitationReferenceSchema,
  InvitationTokenSchema,
  InviteInputSchema,
  WorkspaceInputSchema,
  type InvitationReference,
  type InviteInput,
  type WorkspaceInput,
} from "./schemas";

// Validation plus one call into the backend. Kept out of the "use server"
// module so that only the form wrappers callers actually invoke from the
// browser become endpoints.

export async function createWorkspace(input: WorkspaceInput) {
  const parsed = WorkspaceInputSchema.parse(input);
  const backend = await getWorkspaceBackend();
  return backend.createWorkspace(parsed);
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
