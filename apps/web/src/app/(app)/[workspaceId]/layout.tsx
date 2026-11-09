import { notFound, redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { getWorkspaceActivity } from "@/features/activity/actions";
import { WorkspaceActivityProvider } from "@/features/activity/workspace-activity-provider";
import { hasPendingTasteSuggestions } from "@/features/inspiration/taste/taste-actions";
import { listRooms } from "@/features/rooms/queries";
import { listWorkspaceProjects } from "@/features/projects/actions";
import { getWorkspaceBackend } from "@/features/workspaces/backend";
import { NativeBridge } from "@/features/native/native-bridge";
import { AppFrame } from "@/ui/app-frame";
import { OrionSidebar } from "@/ui/orion-sidebar";

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

  const [projects, rooms, hasTasteUpdates, initialActivity] = await Promise.all(
    [
      listWorkspaceProjects(workspaceId),
      listRooms(workspaceId),
      hasPendingTasteSuggestions(workspaceId),
      getWorkspaceActivity(workspaceId).catch(() => []),
    ],
  );
  const sidebarRooms = rooms.map((room) => ({
    id: room.id,
    projectId: room.projectId,
  }));

  return (
    <WorkspaceActivityProvider
      workspaceId={workspaceId}
      initial={initialActivity}
    >
      <AppFrame
        navigation={
          <Suspense fallback={null}>
            <OrionSidebar
              workspaceId={workspaceId}
              projects={projects}
              rooms={sidebarRooms}
              hasTasteUpdates={hasTasteUpdates}
            />
          </Suspense>
        }
      >
        <NativeBridge workspaceId={workspaceId} />
        {children}
      </AppFrame>
    </WorkspaceActivityProvider>
  );
}
