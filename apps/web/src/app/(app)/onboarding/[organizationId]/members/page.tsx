import { notFound } from "next/navigation";
import { InviteOnboarding } from "@/features/workspaces/invite-onboarding";
import { loadOrganizationPeople } from "@/features/workspaces/organization-people";

export default async function InviteMembersOnboardingPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const returnPath = `/onboarding/${organizationId}/members`;
  const { isAdmin, members, invitations } =
    await loadOrganizationPeople(organizationId, returnPath);

  if (!isAdmin) {
    notFound();
  }

  return (
    <InviteOnboarding
      organizationId={organizationId}
      members={members.map((member) => ({
        email: member.email,
        role: member.role === "admin" ? "Admin" : "Member",
      }))}
      invitations={invitations
        .filter(
          (invitation) =>
            !invitation.accepted_at && !invitation.revoked_at,
        )
        .map((invitation) => ({ email: invitation.email }))}
    />
  );
}
