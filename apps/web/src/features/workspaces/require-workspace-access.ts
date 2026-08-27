import { notFound, redirect } from "next/navigation";
import { getWorkspaceBackend } from "./backend";

/**
 * The single auth + membership gate for every workspace surface. One
 * implementation on purpose: the deck renders outside the shell layout, and
 * two copies of this check is exactly how one of them ends up missing.
 *
 * Signed-out and not-a-member stay distinct -- the first goes to sign-in, the
 * second to `notFound()`, so the app never leaks which workspace ids exist.
 */
export async function requireWorkspaceAccess(workspaceId: string) {
  const backend = await getWorkspaceBackend();
  const access = await backend.getWorkspaceShell(workspaceId);

  if (access.status === "unauthenticated") {
    redirect(`/sign-in?next=${encodeURIComponent(`/${workspaceId}`)}`);
  }
  if (access.status === "not-a-member") {
    notFound();
  }

  return access.data;
}
