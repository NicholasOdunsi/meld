import { notFound } from "next/navigation";
import { InviteOnboarding } from "@/features/workspaces/invite-onboarding";
import { loadWorkspacePeople } from "@/features/workspaces/workspace-people";
import { formatProductRole } from "@/features/workspaces/product-roles";

export default async function InviteMembersOnboardingPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const returnPath = `/onboarding/${workspaceId}/members`;
  const { isAdmin, members, invitations } =
    await loadWorkspacePeople(workspaceId, returnPath);

  if (!isAdmin) {
    notFound();
  }

  return (
    <InviteOnboarding
      workspaceId={workspaceId}
      members={members.map((member) => ({
        email: member.email,
        role:
          formatProductRole(member.product_role) ??
          (member.role === "admin" ? "Admin" : "Member"),
      }))}
      invitations={invitations
        .filter(
          (invitation) =>
            !invitation.accepted_at && !invitation.revoked_at,
        )
        .map((invitation) => ({
          email: invitation.email,
          role:
            formatProductRole(invitation.product_role) ?? "Invited",
        }))}
    />
  );
}
