import { HStack } from "@astryxdesign/core/HStack";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { InviteMemberForm } from "@/features/workspaces/invite-member-form";
import { getInvitationPresentation } from "@/features/workspaces/invitation-presentation";
import { loadWorkspacePeople } from "@/features/workspaces/workspace-people";
import { formatProductRole } from "@/features/workspaces/product-roles";
import {
  MembersTable,
  type MemberRow,
} from "@/features/workspaces/members-table";

function formatExpiration(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { isAdmin, members, invitations } =
    await loadWorkspacePeople(
      workspaceId,
      `/${workspaceId}/settings/members`,
    );

  const memberRows: MemberRow[] = members.map((membership) => ({
    id: `member:${membership.user_id}`,
    email: membership.email,
    role:
      formatProductRole(membership.product_role) ??
      (membership.role === "admin" ? "Admin" : "Member"),
    state: "Active",
    stateVariant: "success",
    expiration: "—",
    workspaceId,
    canRetry: false,
    canRevoke: false,
  }));
  const invitationRows: MemberRow[] = invitations
    // Accepted invitations already have a matching member row above —
    // keep showing only invitations still awaiting a response.
    .filter((invitation) => !invitation.accepted_at)
    .map((invitation) => {
      const presentation = getInvitationPresentation({
        acceptedAt: invitation.accepted_at,
        revokedAt: invitation.revoked_at,
        expiresAt: invitation.expires_at,
        deliveryStatus: invitation.delivery_status,
        isAdmin,
      });

      return {
        id: `invitation:${invitation.id}`,
        email: invitation.email,
        role: formatProductRole(invitation.product_role) ?? "Invitee",
        state: presentation.state,
        stateVariant: presentation.stateVariant,
        expiration: formatExpiration(invitation.expires_at),
        workspaceId,
        invitationId: invitation.id,
        canRetry: presentation.canRetry,
        canRevoke: presentation.canRevoke,
      };
    });

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <HStack
            paddingInline={6}
            paddingBlock={4}
            hAlign="between"
            vAlign="center"
          >
            <VStack gap={1}>
              <Heading level={1}>Members</Heading>
              <Text type="supporting">
                Manage active teammates and expiring invitations.
              </Text>
            </VStack>
          </HStack>
        </LayoutHeader>
      }
    >
      <LayoutContent padding={0}>
        <VStack gap={6} paddingBlock={6}>
          {isAdmin ? (
            <VStack paddingInline={6}>
              <InviteMemberForm workspaceId={workspaceId} />
            </VStack>
          ) : null}
          <MembersTable rows={[...memberRows, ...invitationRows]} />
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
