import { AppShell } from "@astryxdesign/core/AppShell";
import { Center } from "@astryxdesign/core/Center";
import { redirect } from "next/navigation";
import { AcceptInvitationCard } from "@/features/workspaces/accept-invitation-card";
import { getWorkspaceBackend } from "@/features/workspaces/backend";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const backend = await getWorkspaceBackend();
  const currentUserId = await backend.getCurrentUserId();

  if (!currentUserId) {
    redirect(
      `/sign-in?next=${encodeURIComponent(`/invitations/${token}`)}`,
    );
  }

  return (
    <AppShell height="fill" variant="wash" contentPadding={4}>
      <Center width="100%" height="100%">
        <AcceptInvitationCard token={token} />
      </Center>
    </AppShell>
  );
}
