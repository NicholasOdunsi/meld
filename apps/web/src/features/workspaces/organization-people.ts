import "server-only";

import { notFound, redirect } from "next/navigation";
import { getWorkspaceBackend } from "./backend";

export type {
  InvitationRecord,
  MembershipRecord,
} from "./backend";

function signInPath(returnPath: string) {
  return `/sign-in?next=${encodeURIComponent(returnPath)}`;
}

export async function requireOrganizationMembership(
  organizationId: string,
  returnPath: string,
) {
  const backend = await getWorkspaceBackend();
  const access = await backend.getOrganizationShell(organizationId);
  if (access.status === "unauthenticated") {
    redirect(signInPath(returnPath));
  }
  if (access.status === "not-a-member") {
    notFound();
  }
}

export async function loadOrganizationPeople(
  organizationId: string,
  returnPath: string,
) {
  const backend = await getWorkspaceBackend();
  const access = await backend.getOrganizationPeople(organizationId);
  if (access.status === "unauthenticated") {
    redirect(signInPath(returnPath));
  }
  if (access.status === "not-a-member") {
    notFound();
  }
  return access.data;
}
