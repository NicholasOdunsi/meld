import type { Room } from "@/features/rooms/repository";
import type { AttentionItem, AttentionResolver } from "./types";

// A room is stale once it has been quiet for this long. A guess, not a
// measurement -- revisit once there is a week of real usage to look at.
export const DEFAULT_IDLE_DAYS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type IdleRoomResolverInput = {
  /** Already fetched by the page -- this resolver issues no query. */
  rooms: Room[];
  now: Date;
  idleDays?: number;
};

export function createIdleRoomResolver({
  rooms,
  now,
  idleDays = DEFAULT_IDLE_DAYS,
}: IdleRoomResolverInput): AttentionResolver {
  return {
    kind: "room_idle",
    async resolve(context) {
      return rooms
        .filter((room) => room.workspaceId === context.workspaceId)
        .map((room) => ({
          room,
          days: Math.floor(
            (now.getTime() - new Date(room.lastActivityAt).getTime()) /
              MS_PER_DAY,
          ),
        }))
        .filter(({ days }) => days > idleDays)
        // Quietest first: the room that has been dead longest is the one
        // most likely to have been forgotten.
        .sort((left, right) => right.days - left.days)
        .map(({ room, days }): AttentionItem => ({
          id: `room-idle-${room.id}`,
          kind: "room_idle",
          title: `Nothing has moved here in ${days} days.`,
          roomId: room.id,
          roomName: room.name,
          occurredAt: room.lastActivityAt,
          href: `/${context.workspaceId}/rooms/${room.id}`,
          actionLabel: "RESUME",
        }));
    },
  };
}
