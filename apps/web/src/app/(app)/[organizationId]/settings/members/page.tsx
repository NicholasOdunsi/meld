import { HStack } from "@astryxdesign/core/HStack";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { notFound, redirect } from "next/navigation";
import { InviteMemberForm } from "@/features/workspaces/invite-member-form";
import { getInvitationPresentation } from "@/features/workspaces/invitation-presentation";
import {
  MembersTable,
  type MemberRow,
} from "@/features/workspaces/members-table";
import { createClient } from "@/lib/supabase/server";
import {
  isWorkspaceFakeEnabled,
  listFakeOrganizationPeople,
} from "@/features/workspaces/e2e-fake";

type MembershipRecord = {
  user_id: string;
  email: string;
  role: "admin" | "member";
  created_at: string;
};

type InvitationRecord = {
  id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  delivery_status: "pending" | "sent" | "failed";
};

function formatExpiration(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export default async function MembersPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  let isAdmin: boolean;
  let members: MembershipRecord[];
  let invitations: InvitationRecord[];

  if (isWorkspaceFakeEnabled()) {
    const people = await listFakeOrganizationPeople(organizationId);
    if (!people) {
      redirect(
        `/sign-in?next=${encodeURIComponent(
          `/${organizationId}/settings/members`,
        )}`,
      );
    }
    isAdmin = people.isAdmin;
    members = people.members;
    invitations = people.invitations;
  } else {
    const supabase = await createClient(new Headers());
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(
        `/sign-in?next=${encodeURIComponent(
          `/${organizationId}/settings/members`,
        )}`,
      );
    }

    const { data: currentMembership } = await supabase
      .from("memberships")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!currentMembership) {
      notFound();
    }

    isAdmin = currentMembership.role === "admin";
    const { data: memberData, error: membersError } =
      await supabase.rpc("list_organization_members", {
        target_organization_id: organizationId,
      });
    const invitationResult = isAdmin
      ? await supabase
          .from("invitations")
          .select(
            "id,email,expires_at,accepted_at,revoked_at,delivery_status",
          )
          .eq("organization_id", organizationId)
          .order("created_at")
      : { data: [], error: null };

    if (membersError || invitationResult.error) {
      throw new Error("We could not load organization members.");
    }
    members = (memberData ?? []) as MembershipRecord[];
    invitations = (invitationResult.data ?? []) as InvitationRecord[];
  }

  const memberRows: MemberRow[] = members.map((membership) => ({
    id: `member:${membership.user_id}`,
    email: membership.email,
    role: membership.role === "admin" ? "Admin" : "Member",
    state: "Active",
    stateVariant: "success",
    expiration: "—",
    organizationId,
    canRetry: false,
    canRevoke: false,
  }));
  const invitationRows: MemberRow[] = invitations.map((invitation) => {
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
      role: "Invitee",
      state: presentation.state,
      stateVariant: presentation.stateVariant,
      expiration: formatExpiration(invitation.expires_at),
      organizationId,
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
              <InviteMemberForm organizationId={organizationId} />
            </VStack>
          ) : null}
          <MembersTable rows={[...memberRows, ...invitationRows]} />
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
