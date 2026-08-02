import { describe, expect, it } from "vitest";
import { createPrdRepository } from "./repository";

function fakeSupabase(row: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { from: () => builder } as never;
}

const dbRow = {
  id: "00000000-0000-4000-8000-000000000001",
  room_id: "40000000-0000-4000-8000-000000000001",
  version: 2,
  status: "draft",
  document: { title: "Checkout redesign", executiveSummary: "", problemAndEvidence: "",
    targetUsersAndUseCases: "", goalsNonGoalsAndMetrics: "", proposedSolution: "",
    userJourneys: "", functionalRequirements: [], nonFunctionalRequirements: [],
    uxStatesAndEdgeCases: [], dependenciesAndConstraints: [], risksAndMitigations: [],
    mvpScope: { included: [], excluded: [] }, acceptanceCriteria: [], openQuestions: [],
    decisionHistory: [] },
  owner_id: "10000000-0000-4000-8000-000000000001",
  created_at: "2026-08-02T10:35:00.000Z",
  updated_at: "2026-08-02T10:35:00.000Z",
};

describe("createPrdRepository.getRoomPrd", () => {
  it("returns the latest PRD parsed through the contract", async () => {
    const repo = createPrdRepository(fakeSupabase(dbRow));
    const prd = await repo.getRoomPrd("40000000-0000-4000-8000-000000000001");
    expect(prd?.version).toBe(2);
    expect(prd?.document.title).toBe("Checkout redesign");
  });

  it("returns null when the room has no PRD", async () => {
    const repo = createPrdRepository(fakeSupabase(null));
    expect(await repo.getRoomPrd("40000000-0000-4000-8000-000000000001")).toBeNull();
  });
});
