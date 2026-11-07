// apps/web/src/features/inspiration/taste/refresh-taste.test.ts
import { describe, expect, it, vi } from "vitest";
import { refreshTaste } from "./refresh-taste";
import { TasteWriterError, type TasteWriter } from "./deepseek-taste-writer";

vi.mock("server-only", () => ({}));

const WS = "00000000-0000-4000-8000-0000000000aa";
const USER = "00000000-0000-4000-8000-0000000000bb";
const ITEM = "00000000-0000-4000-8000-000000000001";
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
const LABEL_ROW = {
  item_id: ITEM,
  device: "mobile",
  screen_type: "login",
  patterns: ["form"],
  theme: "light",
  colors: ["#ffffff"],
  style_words: ["minimal"],
  description: "d",
  updated_at: "2026-11-07T00:00:00.000Z",
};

function fakeClient(claim: unknown[]) {
  const rpc = vi.fn(async (name: string, _args?: unknown) => {
    if (name === "claim_taste_refresh") return { data: claim, error: null };
    if (name === "finish_taste_refresh") return { data: 1, error: null };
    return { data: null, error: null };
  });
  const rows: Record<string, unknown[]> = {
    inspiration_labels: [LABEL_ROW],
    taste_suggestions: [{ value_key: "density:set:dense" }],
    taste_signals: [{ reason: "too_plain" }, { reason: "too_plain" }],
  };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "gt", "order", "limit"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: rows[table] ?? [], error: null });
    return chain;
  };
  return { client: { rpc, from } as never, rpc };
}

const writer = (over: Partial<TasteWriter> = {}): TasteWriter => ({
  model: "m",
  firstBoard: vi.fn(async () => BOARD as never),
  suggest: vi.fn(async () => [
    { tile: "density", op: "set", value: "balanced", reason: "r", evidenceItemIds: [ITEM] },
    { tile: "density", op: "set", value: "dense", reason: "r", evidenceItemIds: [] },
  ] as never),
  ...over,
});

describe("refreshTaste", () => {
  it("skips when nothing is claimed", async () => {
    const { client, rpc } = fakeClient([]);
    await expect(refreshTaste(WS, USER, { client, writer: writer() })).resolves.toBe("skipped");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("writes the first board directly", async () => {
    const { client, rpc } = fakeClient([{ is_first: true, sorted_count: 8, board: null, locks: {}, version: 0, last_refresh_at: null }]);
    await expect(refreshTaste(WS, USER, { client, writer: writer() })).resolves.toBe("first_board");
    expect(rpc).toHaveBeenCalledWith("finish_taste_refresh", expect.objectContaining({ first_board: BOARD, new_suggestions: null, sorted_count: 8 }));
  });

  it("filters suggestions (rejected keys) and passes redo counts to the writer", async () => {
    const { client, rpc } = fakeClient([{ is_first: false, sorted_count: 20, board: BOARD, locks: {}, version: 3, last_refresh_at: "2026-11-01T00:00:00.000Z" }]);
    const w = writer();
    await expect(refreshTaste(WS, USER, { client, writer: w })).resolves.toBe("suggested");
    expect(w.suggest).toHaveBeenCalledWith(expect.objectContaining({ redoSignals: [{ reason: "too_plain", count: 2 }] }));
    const finish = rpc.mock.calls.find(([name]) => name === "finish_taste_refresh")?.[1] as { new_suggestions: { valueKey: string }[] };
    expect(finish.new_suggestions.map((s) => s.valueKey)).toEqual(["density:set:balanced"]);
  });

  it("releases the claim and writes nothing when the writer fails", async () => {
    const { client, rpc } = fakeClient([{ is_first: true, sorted_count: 8, board: null, locks: {}, version: 0, last_refresh_at: null }]);
    const failing = writer({ firstBoard: vi.fn(async () => { throw new TasteWriterError("invalid_response"); }) });
    await expect(refreshTaste(WS, USER, { client, writer: failing })).resolves.toBe("failed");
    expect(rpc).toHaveBeenCalledWith("release_taste_refresh", { target_workspace_id: WS, target_user_id: USER });
    expect(rpc).not.toHaveBeenCalledWith("finish_taste_refresh", expect.anything());
  });
});
