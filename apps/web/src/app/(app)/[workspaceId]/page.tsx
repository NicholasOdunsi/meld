import { listPendingItems } from "@/features/home/actions";
import {
  isAnyAgentWorking,
  type PresenceQueryClient,
} from "@/features/home/agent-presence";
import type { AttentionItem } from "@/features/home/attention/types";
import { Deck } from "@/features/home/components/deck";
import type { DeckProject } from "@/features/home/components/project-column";
import { listWorkspaceProjects } from "@/features/projects/actions";
import type { ProjectSummary } from "@/features/projects/schemas";
import { listRooms } from "@/features/rooms/queries";
import type { Room } from "@/features/rooms/repository";
import { requireWorkspaceAccess } from "@/features/workspaces/require-workspace-access";
import { createClient } from "@/lib/supabase/server";

type RoomGroup = {
  count: number;
  /** The most recently active room in the project -- where its tile goes. */
  latestRoomId: string;
  lastActivityAt: string;
};

function groupRoomsByProject(rooms: Room[]): Map<string, RoomGroup> {
  const groups = new Map<string, RoomGroup>();

  for (const room of rooms) {
    const activity = new Date(room.lastActivityAt).getTime();
    const group = groups.get(room.projectId);

    if (!group) {
      groups.set(room.projectId, {
        count: 1,
        latestRoomId: room.id,
        lastActivityAt: room.lastActivityAt,
      });
      continue;
    }

    group.count += 1;
    if (activity > new Date(group.lastActivityAt).getTime()) {
      group.lastActivityAt = room.lastActivityAt;
      group.latestRoomId = room.id;
    }
  }

  return groups;
}

function toDeckProjects(
  projects: ProjectSummary[],
  rooms: Room[],
): DeckProject[] {
  const groups = groupRoomsByProject(rooms);

  return [...projects]
    .sort((left, right) => {
      const leftAt = groups.get(left.id)?.lastActivityAt;
      const rightAt = groups.get(right.id)?.lastActivityAt;
      // Projects with no rooms have no activity to sort on, so they fall to
      // the bottom in name order rather than to the top on a fake timestamp.
      if (!leftAt && !rightAt) return left.name.localeCompare(right.name);
      if (!leftAt) return 1;
      if (!rightAt) return -1;
      return new Date(rightAt).getTime() - new Date(leftAt).getTime();
    })
    .map((project) => {
      const group = groups.get(project.id);

      return {
        id: project.id,
        name: project.name,
        color: project.color,
        roomCount: group?.count ?? 0,
        latestRoomId: group?.latestRoomId ?? null,
        // Null, not "now": a project with no rooms has never been worked in,
        // and the tile drops the age clause rather than printing an activity
        // timestamp that nothing produced.
        updatedAt: group?.lastActivityAt ?? null,
        // No per-project signal exists for either yet: agent presence is only
        // known workspace-wide, and nothing tracks read state. The deck shows
        // nothing rather than claiming something it cannot demonstrate.
        isLive: false,
        unreadCount: 0,
        // Decorative shape cue only -- there is no document-type signal to
        // read (see `MeldPeekCard`).
        peekShape: "doc" as const,
      };
    });
}

/**
 * Agent presence, failing closed. `isAnyAgentWorking` already swallows a query
 * error; this also swallows a client that cannot be constructed, because an
 * animating sprite with no run behind it is a lie the deck must not tell.
 */
async function agentIsWorking(workspaceId: string): Promise<boolean> {
  try {
    const supabase = await createClient(new Headers());
    return await isAnyAgentWorking(
      supabase as unknown as PresenceQueryClient,
      workspaceId,
    );
  } catch (thrown) {
    // Logged, not silent: pinning the sprite to idle forever because the
    // Supabase client could not be constructed is the kind of failure that
    // otherwise looks like "the agents are just quiet today".
    console.error("deck agent presence threw", { workspaceId, thrown });
    return false;
  }
}

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

  const [projects, rooms] = await Promise.all([
    listWorkspaceProjects(workspaceId),
    listRooms(workspaceId),
  ]);

  // Every pending kind, and every agent task, is anchored to a room. A
  // workspace with no rooms is provably empty on both counts, so neither
  // query runs rather than returning a result that is guaranteed empty.
  const [items, isAgentWorking] = await Promise.all([
    rooms.length > 0
      ? listPendingItems(workspaceId, rooms)
      : Promise.resolve<AttentionItem[]>([]),
    rooms.length > 0 ? agentIsWorking(workspaceId) : Promise.resolve(false),
  ]);

  const printedOn = new Date();

  return (
    <Deck
      workspaceId={workspaceId}
      workspaceName={access.workspaceName}
      projects={toDeckProjects(projects, rooms)}
      items={items}
      isAgentWorking={isAgentWorking}
      printedOn={printedOn}
    />
  );
}
