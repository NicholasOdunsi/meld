import { notFound } from "next/navigation";
import { InviteOnboarding } from "@/features/workspaces/invite-onboarding";
import { loadOrganizationPeople } from "@/features/workspaces/organization-people";
import { formatProductRole } from "@/features/workspaces/product-roles";

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
