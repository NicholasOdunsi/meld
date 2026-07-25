import "server-only";

import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  isWorkspaceFakeEnabled,
  listFakeOrganizationPeople,
} from "./e2e-fake";

export type MembershipRecord = {
  user_id: string;
  email: string;
  role: "admin" | "member";
  created_at: string;
};

export type InvitationRecord = {
  id: string;
  email: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  delivery_status: "pending" | "sent" | "failed";
};

export async function loadOrganizationPeople(
  organizationId: string,
  returnPath: string,
) {
  if (isWorkspaceFakeEnabled()) {
    const people = await listFakeOrganizationPeople(organizationId);
    if (!people) {
      redirect(
        `/sign-in?next=${encodeURIComponent(returnPath)}`,
      );
    }
    return people;
  }

  const supabase = await createClient(new Headers());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(returnPath)}`);
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

  const isAdmin = currentMembership.role === "admin";
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

  return {
    isAdmin,
    members: (memberData ?? []) as MembershipRecord[],
    invitations: (invitationResult.data ?? []) as InvitationRecord[],
  };
}
