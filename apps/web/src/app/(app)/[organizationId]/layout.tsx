import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { listDiscoveryRooms } from "@/features/discovery/actions";
import {
  getFakeOrganizationContext,
  isWorkspaceFakeEnabled,
} from "@/features/workspaces/e2e-fake";
import { createClient } from "@/lib/supabase/server";
import { AppFrame } from "@/ui/app-frame";
import { DashboardNavigation } from "@/ui/dashboard-navigation";

export default async function OrganizationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  if (isWorkspaceFakeEnabled()) {
    const context = await getFakeOrganizationContext(organizationId);
    if (!context) {
      redirect(
        `/sign-in?next=${encodeURIComponent(
          `/${organizationId}`,
        )}`,
      );
    }
    const rooms = await listDiscoveryRooms(organizationId);

    return (
      <AppFrame
        navigation={
          <DashboardNavigation
            organizationId={organizationId}
            organizationName={context.organization.name}
            rooms={rooms}
          />
        }
      >
        {children}
      </AppFrame>
    );
  }

  const supabase = await createClient(new Headers());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/sign-in?next=${encodeURIComponent(
        `/${organizationId}`,
      )}`,
    );
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();
  const { data: organization } = await supabase
    .from("organizations")
    .select("name,logo_path")
    .eq("id", organizationId)
    .maybeSingle();

  if (!membership || !organization) {
    notFound();
  }
  const rooms = await listDiscoveryRooms(organizationId);
  const organizationLogoUrl = organization.logo_path
    ? supabase.storage
        .from("organization-logos")
        .getPublicUrl(organization.logo_path).data.publicUrl
    : null;

  return (
    <AppFrame
      navigation={
        <DashboardNavigation
          organizationId={organizationId}
          organizationName={organization.name}
          organizationLogoUrl={organizationLogoUrl}
          rooms={rooms}
        />
      }
    >
      {children}
    </AppFrame>
  );
}
