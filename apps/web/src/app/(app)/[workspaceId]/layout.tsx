import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { listRooms } from "@/features/rooms/queries";
import { listWorkspaceProjects } from "@/features/projects/actions";
import { getWorkspaceBackend } from "@/features/workspaces/backend";
import { AppFrame } from "@/ui/app-frame";
import { WorkspaceNavigation } from "@/ui/workspace-navigation";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const backend = await getWorkspaceBackend();
  const access = await backend.getWorkspaceShell(workspaceId);

  if (access.status === "unauthenticated") {
    redirect(`/sign-in?next=${encodeURIComponent(`/${workspaceId}`)}`);
  }
  if (access.status === "not-a-member") {
    notFound();
  }

  const [projects, rooms, workspaces] = await Promise.all([
    listWorkspaceProjects(workspaceId),
    listRooms(workspaceId),
    backend.listUserWorkspaces(),
  ]);

  return (
    <AppFrame
      navigation={
        <WorkspaceNavigation
          workspaceId={workspaceId}
          workspaceName={access.data.workspaceName}
          workspaces={workspaces.map((workspace) => ({
            id: workspace.workspaceId,
            name: workspace.workspaceName,
            logoUrl: workspace.workspaceLogoUrl,
          }))}
          currentUserId={access.data.currentUserId}
          isWorkspaceAdmin={access.data.isAdmin}
          projects={projects}
          rooms={rooms}
        />
      }
    >
      {children}
    </AppFrame>
  );
}
