// apps/web/src/features/inspiration/taste/taste-actions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isRoomFakeEnabled: vi.fn(() => false),
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: mocks.rpc, from: mocks.from, auth: { getUser: async () => ({ data: { user: { id: "u" } } }) } }),
}));

import { decideTasteSuggestion, recordTasteSignal, saveTasteTile } from "./taste-actions";

const SUGGESTION_ID = "00000000-0000-4000-8000-000000000001";
const WS = "00000000-0000-4000-8000-0000000000aa";
const BOARD = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "heavy", tracking: "tight", note: "" },
  spacing: "generous",
  density: "airy",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
};

function selectReturning(table: string, data: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) chain[m] = () => chain;
  chain.maybeSingle = async () => ({ data, error: null });
  return chain;
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset();
});

describe("decideTasteSuggestion", () => {
  it("keeps by sending the applied board at the read version", async () => {
    mocks.from.mockImplementation((table: string) =>
      table === "taste_suggestions"
        ? selectReturning(table, { id: SUGGESTION_ID, workspace_id: WS, tile: "density", op: "set", value: "balanced", status: "pending" })
        : selectReturning(table, { board: BOARD, version: 4 }),
    );
    mocks.rpc.mockResolvedValue({ data: "kept", error: null });
    await expect(decideTasteSuggestion({ suggestionId: SUGGESTION_ID, decision: "kept" })).resolves.toEqual({ status: "kept" });
    expect(mocks.rpc).toHaveBeenCalledWith("decide_taste_suggestion", {
      target_suggestion_id: SUGGESTION_ID,
      decision: "kept",
      new_board: { ...BOARD, density: "balanced" },
      expected_version: 4,
    });
  });

  it("rejecting an add appends it to avoid", async () => {
    mocks.from.mockImplementation((table: string) =>
      table === "taste_suggestions"
        ? selectReturning(table, { id: SUGGESTION_ID, workspace_id: WS, tile: "signatureDetails", op: "add", value: "Pill buttons", status: "pending" })
        : selectReturning(table, { board: BOARD, version: 4 }),
    );
    mocks.rpc.mockResolvedValue({ data: "rejected", error: null });
    await decideTasteSuggestion({ suggestionId: SUGGESTION_ID, decision: "rejected" });
    const args = mocks.rpc.mock.calls[0][1] as { new_board: typeof BOARD };
    expect(args.new_board.avoid).toEqual([{ text: "Pill buttons", source: "rejected" }]);
  });

  it("sends a null board when keeping no longer applies (superseded)", async () => {
    mocks.from.mockImplementation((table: string) =>
      table === "taste_suggestions"
        ? selectReturning(table, { id: SUGGESTION_ID, workspace_id: WS, tile: "density", op: "set", value: "airy", status: "pending" })
        : selectReturning(table, { board: BOARD, version: 4 }),
    );
    mocks.rpc.mockResolvedValue({ data: "superseded", error: null });
    await expect(decideTasteSuggestion({ suggestionId: SUGGESTION_ID, decision: "kept" })).resolves.toEqual({ status: "superseded" });
    expect((mocks.rpc.mock.calls[0][1] as { new_board: unknown }).new_board).toBeNull();
  });
});

describe("saveTasteTile", () => {
  it("validates the tile value before calling the RPC", async () => {
    mocks.from.mockImplementation(() => selectReturning("taste_profiles", { board: BOARD, version: 2 }));
    await expect(saveTasteTile({ workspaceId: WS, tile: "density", value: "roomy", expectedVersion: 2 })).resolves.toEqual({ status: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: 3, error: null });
    await expect(saveTasteTile({ workspaceId: WS, tile: "density", value: "dense", expectedVersion: 2 })).resolves.toEqual({ status: "saved", version: 3 });
    expect(mocks.rpc).toHaveBeenCalledWith("save_taste_board", expect.objectContaining({ lock_tile: "density", expected_version: 2 }));
  });

  it("reports a version conflict when the RPC returns null", async () => {
    mocks.from.mockImplementation(() => selectReturning("taste_profiles", { board: BOARD, version: 2 }));
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    await expect(saveTasteTile({ workspaceId: WS, tile: "density", value: "dense", expectedVersion: 2 })).resolves.toEqual({ status: "conflict" });
  });
});

describe("recordTasteSignal", () => {
  it("rejects unknown reasons without calling the RPC", async () => {
    await expect(recordTasteSignal({ screenId: SUGGESTION_ID, reason: "ugly" as never })).resolves.toEqual({ status: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
