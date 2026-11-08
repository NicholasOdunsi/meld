import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { hasPendingTasteSuggestions } from "@/features/inspiration/taste/taste-actions";
import { listRooms } from "@/features/rooms/queries";
import { listWorkspaceProjects } from "@/features/projects/actions";
import { listWorkspaceAttention } from "@/features/workspaces/attention-summary";
import { getWorkspaceBackend } from "@/features/workspaces/backend";
import { NativeBridge } from "@/features/native/native-bridge";
import { AppFrame } from "@/ui/app-frame";
import { WorkspaceNavigation } from "@/ui/workspace-navigation";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

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

  const [projects, rooms, workspaces, attention, hasTasteUpdates] = await Promise.all([
    listWorkspaceProjects(workspaceId),
    listRooms(workspaceId),
    backend.listUserWorkspaces(),
    listWorkspaceAttention(),
    hasPendingTasteSuggestions(workspaceId),
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
            hasAttention: attention.has(workspace.workspaceId),
          }))}
          currentUserId={access.data.currentUserId}
          isWorkspaceAdmin={access.data.isAdmin}
          projects={projects}
          rooms={rooms}
          lifecycleRealtimeEnabled={!isRoomFakeEnabled()}
          hasTasteUpdates={hasTasteUpdates}
        />
      }
    >
      <NativeBridge workspaceId={workspaceId} />
      {children}
    </AppFrame>
  );
}
