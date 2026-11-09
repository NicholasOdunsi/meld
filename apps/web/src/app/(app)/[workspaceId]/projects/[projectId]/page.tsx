import { redirect } from "next/navigation";
import { listWorkspaceProjects } from "@/features/projects/actions";
import { openProject } from "@/features/projects/open-project";

// Clicking a project in the sidebar lands here: open its first chat tab
// (creating "Main" if it has none) and hand over to the room page.
export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  const projects = await listWorkspaceProjects(workspaceId);
  const roomId = await openProject(
    { workspaceId, projectId },
    projects.map((project) => project.id),
  ).catch(() => null);
  redirect(roomId ? `/${workspaceId}/rooms/${roomId}` : `/${workspaceId}`);
}
