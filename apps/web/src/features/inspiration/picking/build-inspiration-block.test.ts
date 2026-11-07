import { describe, expect, it, vi } from "vitest";
import { loadInspirationPicks } from "./build-inspiration-block";

const ROOM = "44444444-4444-4444-8444-444444444444";
const WS = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";
const LABEL_ROW = {
  item_id: ITEM, device: "mobile", screen_type: "login", patterns: ["form"], theme: "dark",
  colors: ["#000000"], style_words: [], description: "Bold headline.", updated_at: "2026-11-06T00:00:00.000Z",
};

function query(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit", "maybeSingle"]) builder[method] = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder;
}

function supabase(tables: Record<string, { data: unknown; error: unknown }>) {
  return { from: vi.fn((table: string) => query(tables[table] ?? { data: null, error: { code: "x" } })) };
}

describe("loadInspirationPicks", () => {
  it("returns picks from room links and sorted labels with origin", async () => {
    const client = supabase({
      rooms: { data: { workspace_id: WS }, error: null },
      design_screens: { data: [{ form_factor: "mobile" }], error: null },
      room_inspiration: { data: [{ item_id: ITEM, created_at: "2026-11-06T00:00:00.000Z" }], error: null },
      inspiration_labels: { data: [LABEL_ROW], error: null },
    });
    const picks = await loadInspirationPicks(client as never, { roomId: ROOM, instruction: "sign in", screenName: null });
    expect(picks).toEqual([expect.objectContaining({ itemId: ITEM, origin: "room" })]);
  });

  it("returns an empty array on any read error", async () => {
    const client = supabase({ rooms: { data: null, error: { code: "42501" } } });
    await expect(loadInspirationPicks(client as never, { roomId: ROOM, instruction: "x", screenName: null })).resolves.toEqual([]);
  });
});
