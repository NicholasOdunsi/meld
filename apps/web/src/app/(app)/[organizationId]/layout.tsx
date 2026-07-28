import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { listDiscoveryRooms } from "@/features/discovery/queries";
import { getWorkspaceBackend } from "@/features/workspaces/backend";
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
  const backend = await getWorkspaceBackend();
  const access = await backend.getOrganizationShell(organizationId);

  if (access.status === "unauthenticated") {
    redirect(`/sign-in?next=${encodeURIComponent(`/${organizationId}`)}`);
  }
  if (access.status === "not-a-member") {
    notFound();
  }

  const [rooms, workspaces] = await Promise.all([
    listDiscoveryRooms(organizationId),
    backend.listUserWorkspaces(),
  ]);

  return (
    <AppFrame
      navigation={
        <DashboardNavigation
          organizationId={organizationId}
          organizationName={access.data.organizationName}
          workspaces={workspaces.map((workspace) => ({
            id: workspace.organizationId,
            name: workspace.organizationName,
            logoUrl: workspace.organizationLogoUrl,
          }))}
          currentUserId={access.data.currentUserId}
          rooms={rooms}
        />
      }
    >
      {children}
    </AppFrame>
  );
}
