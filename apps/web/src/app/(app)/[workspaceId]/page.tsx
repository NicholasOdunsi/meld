import { Deck } from "@/features/home/components/deck";
import type {
  ConsoleProject,
  ConsoleTeammate,
} from "@/features/home/components/workspace-console";
import { listWorkspaceProjects } from "@/features/projects/actions";
import type { ProjectSummary } from "@/features/projects/schemas";
import { listRooms } from "@/features/rooms/queries";
import type { Room } from "@/features/rooms/repository";
import { requireWorkspaceAccess } from "@/features/workspaces/require-workspace-access";
import { getWorkspaceBackend } from "@/features/workspaces/backend";

const STAGE_LABELS: Record<string, string> = {
  discovery: "Discovery",
  define: "Define",
  design: "Design",
  development: "Development",
};

function toConsoleProjects(
  projects: ProjectSummary[],
  rooms: Room[],
): ConsoleProject[] {
  return projects.map((project) => {
    const projectRooms = rooms
      .filter((room) => room.projectId === project.id)
      .sort(
        (left, right) =>
          new Date(right.lastActivityAt).getTime() -
          new Date(left.lastActivityAt).getTime(),
      );

    return {
      id: project.id,
      name: project.name,
      icon: project.icon,
      color: project.color,
      // Null, not "now": a project with no rooms has never been worked in.
      updatedAt: projectRooms[0]?.lastActivityAt ?? null,
      rooms: projectRooms.map((room) => ({
        id: room.id,
        name: room.name,
        stage: STAGE_LABELS[room.stage] ?? room.stage,
        stageKey: room.stage,
      })),
    };
  });
}

// Placeholder until agent presence is wired back in: the cast is real, the
// status lines are not derived from anything yet.
const TEAMMATES: ConsoleTeammate[] = [
  {
    id: "design",
    name: "design-agent",
    status: "ready",
    sprite: "purple-pocket",
  },
  {
    id: "product",
    name: "product-agent",
    status: "ready",
    sprite: "pink-stretch",
  },
  {
    id: "research",
    name: "research-agent",
    status: "ready",
    sprite: "lime-squat",
  },
];

export default async function WorkspaceDeckPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  // The deck renders outside the sidebar shell, so it carries the auth +
  // membership gate itself -- the sub-route layouts get it from
  // `WorkspaceShellLayout`, which calls the same function.
  const access = await requireWorkspaceAccess(workspaceId);
  const backend = await getWorkspaceBackend();

  const [projects, rooms, workspaces] = await Promise.all([
    listWorkspaceProjects(workspaceId),
    listRooms(workspaceId),
    backend.listUserWorkspaces(),
  ]);

  return (
    <Deck
      workspaceId={workspaceId}
      workspaceName={access.workspaceName}
      workspaceLogoUrl={
        workspaces.find((workspace) => workspace.workspaceId === workspaceId)
          ?.workspaceLogoUrl ?? null
      }
      workspaces={workspaces.map((workspace) => ({
        id: workspace.workspaceId,
        name: workspace.workspaceName,
        logoUrl: workspace.workspaceLogoUrl,
      }))}
      projects={toConsoleProjects(projects, rooms)}
      teammates={TEAMMATES}
      printedOn={new Date()}
    />
  );
}
