import {
  Layout,
  LayoutContent,
} from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { headers } from "next/headers";
import { AllProjectsList } from "@/features/activity/components/all-projects-list";
import { OverviewHeading } from "@/features/activity/components/overview-heading";
import { listRooms } from "@/features/rooms/queries";
import { listWorkspaceProjects } from "@/features/projects/actions";
import { NoProjectsEmptyState } from "@/features/home/components/no-projects-empty-state";
import { StartingPoints } from "@/features/home/components/starting-points";
import { isOrionFrameUserAgent } from "@/features/native/user-agent";
import { TodoSection } from "@/features/todos/components/todo-section";
import { listTodos } from "@/features/todos/actions";

const CONTENT_MAX_WIDTH = "calc(var(--spacing-12) * 20)";
// Matches the room conversation page's background override
// (apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx),
// which breaks from the AppShell's default surface color. Inside the Orion
// Mac frame the native WindowGlass shows through instead.

export default async function HomePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const [projects, rooms, requestHeaders, todos] = await Promise.all([
    listWorkspaceProjects(workspaceId),
    listRooms(workspaceId),
    headers(),
    listTodos(workspaceId).catch(() => []),
  ]);
  const isNativeFrame = isOrionFrameUserAgent(
    requestHeaders.get("user-agent") ?? "",
  );
  const tabCounts = Object.fromEntries(
    projects.map((project) => [
      project.id,
      rooms.filter((room) => room.projectId === project.id).length,
    ]),
  );
  // Literal token strings (not a ternary inside style={{}}) so the Astryx
  // convention check can see transparent / var(--color-*) rather than an
  // identifier like `isNativeFrame`.
  const backgroundStyle = isNativeFrame
    ? { backgroundColor: "transparent" as const }
    : { backgroundColor: "var(--color-background-body)" as const };

  return (
    <Layout
      height="fill"
      contentWidth={CONTENT_MAX_WIDTH}
      style={backgroundStyle}
    >
      <LayoutContent
        padding={10}
        style={{
          ...backgroundStyle,
          paddingInlineStart: "var(--spacing-12)",
          paddingInlineEnd: "var(--spacing-12)",
        }}
      >
        <VStack
          gap={8}
          width="100%"
          style={{ paddingBlockStart: "var(--spacing-10)" }}
        >
          <OverviewHeading projectCount={projects.length} />
          {projects.length === 0 ? (
            <NoProjectsEmptyState />
          ) : (
            <>
              <TodoSection
                workspaceId={workspaceId}
                projects={projects.map(({ id, name }) => ({ id, name }))}
                initialTodos={todos}
              />
              <AllProjectsList
                workspaceId={workspaceId}
                projects={projects}
                tabCounts={tabCounts}
              />
              <StartingPoints
                workspaceId={workspaceId}
                projectId={projects[0].id}
              />
            </>
          )}
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
