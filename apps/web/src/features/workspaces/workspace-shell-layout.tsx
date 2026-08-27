import type { ReactNode } from "react";
import { listRooms } from "@/features/rooms/queries";
import { listWorkspaceProjects } from "@/features/projects/actions";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { AppFrame } from "@/ui/app-frame";
import { WorkspaceNavigation } from "@/ui/workspace-navigation";
import { listWorkspaceAttention } from "./attention-summary";
import { getWorkspaceBackend } from "./backend";
import { requireWorkspaceAccess } from "./require-workspace-access";

/**
 * The sidebar shell every workspace surface used to get from a route layout
 * one level up. It lives here rather than in `app/` because the deck -- the
 * workspace landing page -- deliberately renders *without* it, and a child
 * route cannot opt out of a parent layout in Next.
 *
 * It runs `requireWorkspaceAccess` itself, so a route that mounts this layout
 * is guarded by construction. The deck runs the same guard in its page.
 */
export async function WorkspaceShellLayout({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const access = await requireWorkspaceAccess(workspaceId);
  const backend = await getWorkspaceBackend();

  const [projects, rooms, workspaces, attention] = await Promise.all([
    listWorkspaceProjects(workspaceId),
    listRooms(workspaceId),
    backend.listUserWorkspaces(),
    listWorkspaceAttention(),
  ]);

  return (
    <AppFrame
      navigation={
        <WorkspaceNavigation
          workspaceId={workspaceId}
          workspaceName={access.workspaceName}
          workspaces={workspaces.map((workspace) => ({
            id: workspace.workspaceId,
            name: workspace.workspaceName,
            logoUrl: workspace.workspaceLogoUrl,
            hasAttention: attention.has(workspace.workspaceId),
          }))}
          currentUserId={access.currentUserId}
          isWorkspaceAdmin={access.isAdmin}
          projects={projects}
          rooms={rooms}
          lifecycleRealtimeEnabled={!isRoomFakeEnabled()}
        />
      }
    >
      {children}
    </AppFrame>
  );
}
