import "server-only";

import { getRoomBackend } from "@/features/rooms/backend";
import { MAIN_TAB_NAME, orderProjectTabs } from "./project-tabs";
import { ProjectReferenceSchema, type ProjectReference } from "./schemas";

// Which chat a project opens on: its first room (the leftmost tab), or a
// freshly made "Main" when the project has none yet -- so clicking a project
// never lands on an empty page. Returns null for a project that isn't in
// this workspace.
export async function openProject(
  input: ProjectReference,
  projectIds: readonly string[],
): Promise<string | null> {
  const parsed = ProjectReferenceSchema.parse(input);
  if (!projectIds.includes(parsed.projectId)) return null;
  const backend = await getRoomBackend();
  const rooms = await backend.listRooms(parsed.workspaceId);
  const first = orderProjectTabs(rooms, parsed.projectId)[0];
  if (first) return first.id;
  const main = await backend.createRoom({
    workspaceId: parsed.workspaceId,
    projectId: parsed.projectId,
    name: MAIN_TAB_NAME,
  });
  return main.id;
}
