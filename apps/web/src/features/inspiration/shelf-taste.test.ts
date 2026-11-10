// shelf-taste.test.ts
import { describe, expect, it, vi } from "vitest";
import type { TasteBoard } from "@meld/contracts";
import { createShelfTaste } from "./shelf-taste";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const SUGGESTION = "44444444-4444-4444-8444-444444444444";
const BOARD: TasteBoard = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "regular", tracking: "normal", note: "" },
  spacing: "generous",
  density: "airy",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
};

function clientWith(handlers: Record<string, (args: Record<string, unknown>) => { data?: unknown; error?: { message: string } }>) {
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    const handler = handlers[name];
    if (!handler) throw new Error(`unexpected rpc ${name}`);
    const out = handler(args);
    return { data: out.data ?? null, error: out.error ?? null };
  });
  return { client: { rpc } as never, rpc };
}

describe("createShelfTaste", () => {
  it("returns the snapshot with camelCase fields and pending suggestions", async () => {
    const { client } = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 3, locks: {} } }),
      capture_list_taste_suggestions: () => ({
        data: [{ id: SUGGESTION, tile: "density", op: "set", value: "balanced", reason: "Seen lately", evidence_item_ids: [] }],
      }),
    });
    const result = await createShelfTaste(client, PRINCIPAL).get();
    expect(result).toEqual({
      ok: true,
      value: {
        board: BOARD,
        version: 3,
        pending: [{ id: SUGGESTION, tile: "density", op: "set", value: "balanced", reason: "Seen lately", evidenceItemIds: [], origin: "learning", source: null }],
      },
    });
  });

  it("returns null when there is no board yet", async () => {
    const { client } = clientWith({ capture_get_taste: () => ({ data: null }), capture_list_taste_suggestions: () => ({ data: [] }) });
    expect(await createShelfTaste(client, PRINCIPAL).get()).toEqual({ ok: true, value: null });
  });

  it("saveTile merges the tile, validates, locks the tile, and reports conflicts", async () => {
    const { client, rpc } = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 3, locks: {} } }),
      capture_save_taste_board: () => ({ data: 4 }),
    });
    const taste = createShelfTaste(client, PRINCIPAL);
    expect(await taste.saveTile({ tile: "density", value: "dense", expectedVersion: 3 })).toEqual({ ok: true, value: { version: 4 } });
    expect(rpc).toHaveBeenCalledWith(
      "capture_save_taste_board",
      expect.objectContaining({
        actor_user_id: PRINCIPAL.userId,
        target_workspace_id: PRINCIPAL.workspaceId,
        expected_version: 3,
        lock_tile: "density",
        new_board: { ...BOARD, density: "dense" },
      }),
    );
    const stale = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 5, locks: {} } }),
      capture_save_taste_board: () => ({ data: null }),
    });
    expect(await createShelfTaste(stale.client, PRINCIPAL).saveTile({ tile: "density", value: "dense", expectedVersion: 3 })).toEqual({ ok: false, error: "conflict" });
  });

  it("saveTile rejects a value that breaks the board rules without calling save", async () => {
    const { client, rpc } = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 3, locks: {} } }),
    });
    const result = await createShelfTaste(client, PRINCIPAL).saveTile({ tile: "density", value: "roomy", expectedVersion: 3 });
    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(rpc).not.toHaveBeenCalledWith("capture_save_taste_board", expect.anything());
  });

  it("decide keeps by applying the operation, and rejects an add into the avoid list", async () => {
    const pendingAdd = { id: SUGGESTION, tile: "signatureDetails", op: "add", value: "Pill buttons", reason: "r", evidence_item_ids: [] };
    const { client, rpc } = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 3, locks: {} } }),
      capture_list_taste_suggestions: () => ({ data: [pendingAdd] }),
      capture_decide_taste_suggestion: () => ({ data: "rejected" }),
    });
    const taste = createShelfTaste(client, PRINCIPAL);
    expect(await taste.decide({ suggestionId: SUGGESTION, decision: "rejected", expectedVersion: 3 })).toEqual({ ok: true, value: { status: "rejected" } });
    expect(rpc).toHaveBeenCalledWith(
      "capture_decide_taste_suggestion",
      expect.objectContaining({
        decision: "rejected",
        new_board: { ...BOARD, avoid: [{ text: "Pill buttons", source: "rejected" }] },
      }),
    );
  });

  it("maps SQL errors to shelf errors", async () => {
    const { client } = clientWith({ capture_get_taste: () => ({ error: { message: "not_authorized" } }) });
    expect(await createShelfTaste(client, PRINCIPAL).get()).toEqual({ ok: false, error: "unauthorized" });
  });

  it("resetTile clears the lock", async () => {
    const { client, rpc } = clientWith({ capture_clear_taste_lock: () => ({ data: null }) });
    expect(await createShelfTaste(client, PRINCIPAL).resetTile("density")).toEqual({ ok: true, value: { tile: "density" } });
    expect(rpc).toHaveBeenCalledWith("capture_clear_taste_lock", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
      lock_tile: "density",
    });
  });

  it("maps origin and source onto pending cards", async () => {
    const { client } = clientWith({
      capture_get_taste: () => ({ data: { board: BOARD, version: 3, locks: {} } }),
      capture_list_taste_suggestions: () => ({
        data: [{ id: SUGGESTION, tile: "density", op: "set", value: "airy", reason: "r", evidence_item_ids: [], origin: "composer", source: { kind: "file", name: "Brand.pdf", locator: "page 6" } }],
      }),
    });
    const result = await createShelfTaste(client, PRINCIPAL).get();
    expect(result.ok && result.value?.pending[0]).toMatchObject({ origin: "composer", source: { name: "Brand.pdf", locator: "page 6" } });
  });

  it("addCards stores cards with their value keys and returns the ids", async () => {
    const { client, rpc } = clientWith({ capture_add_taste_cards: () => ({ data: [SUGGESTION] }) });
    const card = { tile: "spacing", op: "set", value: "generous", reason: "r", source: { kind: "file", name: "B.pdf", locator: "page 3" } } as never;
    const out = await createShelfTaste(client, PRINCIPAL).addCards([{ card, origin: "composer" }], []);
    expect(out).toEqual({ ok: true, value: { ids: [SUGGESTION] } });
    expect(rpc).toHaveBeenCalledWith("capture_add_taste_cards", expect.objectContaining({
      replace_ids: [],
      cards: [expect.objectContaining({ tile: "spacing", value_key: "spacing:set:generous", origin: "composer" })],
    }));
  });

  it("rejectedKeys returns the list", async () => {
    const { client } = clientWith({ capture_rejected_taste_keys: () => ({ data: ["density:set:airy"] }) });
    expect(await createShelfTaste(client, PRINCIPAL).rejectedKeys()).toEqual({ ok: true, value: ["density:set:airy"] });
  });
});
