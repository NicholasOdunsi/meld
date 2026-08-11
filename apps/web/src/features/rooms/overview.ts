import type { RoomStage } from "@meld/contracts";

export type RoomDecision = {
  id: string;
  sourceMessageId: string | null;
  summary: string;
  createdAt: string;
  createdByName: string;
};

export type RoomOverviewData = {
  stage: RoomStage;
  latestActivityAt: string;
  participantCount: number;
  counts: { userFlows: number; prds: number; decisions: number };
  recentDecisions: Array<{
    id: string;
    summary: string;
    createdAt: string;
    createdByName: string;
  }>;
};

export type RoomOverviewSource = {
  stage: RoomStage;
  roomCreatedAt: string;
  roomUpdatedAt: string;
  activityTimestamps: readonly string[];
  participantCount: number;
  counts: RoomOverviewData["counts"];
  decisions: readonly RoomDecision[];
};

export function sortRoomDecisions(
  decisions: readonly RoomDecision[],
): RoomDecision[] {
  return [...decisions].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.id.localeCompare(right.id),
  );
}

export function buildRoomOverview(
  source: RoomOverviewSource,
): RoomOverviewData {
  const latestActivityAt = [
    source.roomCreatedAt,
    source.roomUpdatedAt,
    ...source.activityTimestamps,
  ].reduce((latest, current) => (current > latest ? current : latest));
  const recentDecisions = sortRoomDecisions(source.decisions)
    .slice(-3)
    .reverse()
    .map(({ id, summary, createdAt, createdByName }) => ({
      id,
      summary,
      createdAt,
      createdByName,
    }));

  return {
    stage: source.stage,
    latestActivityAt,
    participantCount: source.participantCount,
    counts: { ...source.counts },
    recentDecisions,
  };
}
