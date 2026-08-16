import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomDecision } from "./overview";

const mocks = vi.hoisted(() => ({
  getRoomBackend: vi.fn(),
  getRoomOverview: vi.fn(),
  listRoomDecisions: vi.fn(),
  listRoomTaskStatuses: vi.fn(),
}));

vi.mock("./backend", () => ({
  getRoomBackend: mocks.getRoomBackend,
}));

import {
  buildRoomOverview,
  sortRoomDecisions,
  sortRoomOverviewParticipants,
} from "./overview";
import {
  getRoomOverview,
  listRoomDecisions,
} from "./queries";

const ROOM_ID = "40000000-0000-4000-8000-000000000004";

function decision(
  id: string,
  createdAt: string,
  summary = `Decision ${id}`,
): RoomDecision {
  return {
    id,
    sourceMessageId: null,
    summary,
    createdAt,
    createdByName: "owner@example.com",
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getRoomBackend.mockResolvedValue({
    getRoomOverview: mocks.getRoomOverview,
    listRoomDecisions: mocks.listRoomDecisions,
    listRoomTaskStatuses: mocks.listRoomTaskStatuses,
  });
});

describe("sortRoomDecisions", () => {
  it("sorts oldest first and uses the id as a stable timestamp tie-breaker", () => {
    const input = [
      decision("c", "2026-08-10T12:00:00.000Z"),
      decision("b", "2026-08-09T12:00:00.000Z"),
      decision("a", "2026-08-10T12:00:00.000Z"),
    ];

    expect(sortRoomDecisions(input).map(({ id }) => id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(input.map(({ id }) => id)).toEqual(["c", "b", "a"]);
  });
});

describe("sortRoomOverviewParticipants", () => {
  it("sorts identities by email and user id without mutating the source", () => {
    const input = [
      { userId: "c", email: "zoe@example.com", access: "view" as const },
      { userId: "b", email: "ada@example.com", access: "edit" as const },
      { userId: "a", email: "ada@example.com", access: "view" as const },
    ];

    expect(
      sortRoomOverviewParticipants(input).map(({ userId }) => userId),
    ).toEqual(["a", "b", "c"]);
    expect(input.map(({ userId }) => userId)).toEqual(["c", "b", "a"]);
  });
});

describe("buildRoomOverview", () => {
  it("derives current stage, latest activity, counts, and three newest decisions", () => {
    const overview = buildRoomOverview({
      stage: "design",
      roomCreatedAt: "2026-08-01T09:00:00.000Z",
      roomUpdatedAt: "2026-08-03T09:00:00.000Z",
      activityTimestamps: [
        "2026-08-02T10:00:00.000Z",
        "2026-08-11T08:00:00.000Z",
        "2026-08-09T16:00:00.000Z",
      ],
      participantCount: 4,
      participants: [
        { userId: "user-b", email: "zoe@example.com", access: "view" },
        { userId: "user-a", email: "ada@example.com", access: "edit" },
      ],
      counts: { userFlows: 1, prds: 2, decisions: 4 },
      decisions: [
        decision("a", "2026-08-04T12:00:00.000Z"),
        decision("d", "2026-08-10T12:00:00.000Z"),
        decision("b", "2026-08-06T12:00:00.000Z"),
        decision("c", "2026-08-08T12:00:00.000Z"),
      ],
    });

    expect(overview).toEqual({
      stage: "design",
      latestActivityAt: "2026-08-11T08:00:00.000Z",
      participantCount: 4,
      participants: [
        { userId: "user-a", email: "ada@example.com", access: "edit" },
        { userId: "user-b", email: "zoe@example.com", access: "view" },
      ],
      counts: { userFlows: 1, prds: 2, decisions: 4 },
      recentDecisions: [
        {
          id: "d",
          summary: "Decision d",
          createdAt: "2026-08-10T12:00:00.000Z",
          createdByName: "owner@example.com",
        },
        {
          id: "c",
          summary: "Decision c",
          createdAt: "2026-08-08T12:00:00.000Z",
          createdByName: "owner@example.com",
        },
        {
          id: "b",
          summary: "Decision b",
          createdAt: "2026-08-06T12:00:00.000Z",
          createdByName: "owner@example.com",
        },
      ],
    });
  });

  it("falls back to room creation for an otherwise inactive room", () => {
    expect(
      buildRoomOverview({
        stage: "discovery",
        roomCreatedAt: "2026-08-01T09:00:00.000Z",
        roomUpdatedAt: "2026-08-01T09:00:00.000Z",
        activityTimestamps: [],
        participantCount: 1,
        participants: [],
        counts: { userFlows: 0, prds: 0, decisions: 0 },
        decisions: [],
      }).latestActivityAt,
    ).toBe("2026-08-01T09:00:00.000Z");
  });
});

describe("room overview queries", () => {
  it("dispatches validated room reads without touching AI task APIs", async () => {
    const decisions = [
      decision("a", "2026-08-04T12:00:00.000Z"),
    ];
    const overview = {
      stage: "define" as const,
      latestActivityAt: "2026-08-04T12:00:00.000Z",
      participantCount: 2,
      participants: [],
      counts: { userFlows: 1, prds: 0, decisions: 1 },
      recentDecisions: decisions.map(
        ({ id, summary, createdAt, createdByName }) => ({
          id,
          summary,
          createdAt,
          createdByName,
        }),
      ),
    };
    mocks.listRoomDecisions.mockResolvedValue(decisions);
    mocks.getRoomOverview.mockResolvedValue(overview);

    await expect(listRoomDecisions(ROOM_ID)).resolves.toEqual(decisions);
    await expect(getRoomOverview(ROOM_ID)).resolves.toEqual(overview);

    expect(mocks.listRoomDecisions).toHaveBeenCalledWith(ROOM_ID);
    expect(mocks.getRoomOverview).toHaveBeenCalledWith(ROOM_ID);
    expect(mocks.listRoomTaskStatuses).not.toHaveBeenCalled();
  });

  it("rejects invalid room ids before constructing a backend", async () => {
    await expect(listRoomDecisions("not-a-room")).rejects.toThrow();
    await expect(getRoomOverview("not-a-room")).rejects.toThrow();
    expect(mocks.getRoomBackend).not.toHaveBeenCalled();
  });
});
