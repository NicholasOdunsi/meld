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

export async function requireWorkspaceMembership(
  workspaceId: string,
  returnPath: string,
) {
  const backend = await getWorkspaceBackend();
  const access = await backend.getWorkspaceShell(workspaceId);
  if (access.status === "unauthenticated") {
    redirect(signInPath(returnPath));
  }
  if (access.status === "not-a-member") {
    notFound();
  }
}

export async function loadWorkspacePeople(
  workspaceId: string,
  returnPath: string,
) {
  const backend = await getWorkspaceBackend();
  const access = await backend.getWorkspacePeople(workspaceId);
  if (access.status === "unauthenticated") {
    redirect(signInPath(returnPath));
  }
  if (access.status === "not-a-member") {
    notFound();
  }
  return access.data;
}
