import { AppShell } from "@astryxdesign/core/AppShell";
import { Center } from "@astryxdesign/core/Center";
import { redirect } from "next/navigation";
import { AcceptInvitationCard } from "@/features/workspaces/accept-invitation-card";
import { createClient } from "@/lib/supabase/server";
import {
  getFakeUser,
  isWorkspaceFakeEnabled,
} from "@/features/workspaces/e2e-fake";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (isWorkspaceFakeEnabled()) {
    const user = await getFakeUser();
    if (!user) {
      redirect(
        `/sign-in?next=${encodeURIComponent(
          `/invitations/${token}`,
        )}`,
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

  const supabase = await createClient(new Headers());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
