// shelf-taste.ts
import "server-only";

import {
  applyTasteOperation,
  InspirationLabelsSchema,
  TasteBoardSchema,
  TasteCardSourceSchema,
  TasteOperationSchema,
  tasteValueKey,
  type InspirationLabels,
  type ShelfErrorCode,
  type ShelfTasteSnapshot,
  type TasteBoard,
  type TasteComposerCard,
  type TasteOperation,
  type TasteTile,
} from "@meld/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ShelfPrincipal } from "./shelf-auth";
import { withRejectedAvoid } from "./taste/taste-board-ops";

export type ShelfTasteError = ShelfErrorCode;
export type ShelfTasteResult<T> = { ok: true; value: T } | { ok: false; error: ShelfTasteError | "conflict" };
export type ShelfTaste = {
  get(): Promise<ShelfTasteResult<ShelfTasteSnapshot | null>>;
  saveTile(input: { tile: TasteTile; value: unknown; expectedVersion: number }): Promise<ShelfTasteResult<{ version: number }>>;
  decide(input: {
    suggestionId: string;
    decision: "kept" | "rejected";
    expectedVersion: number;
  }): Promise<ShelfTasteResult<{ status: "kept" | "rejected" | "superseded" }>>;
  resetTile(tile: TasteTile): Promise<ShelfTasteResult<{ tile: TasteTile }>>;
  rejectedKeys(): Promise<ShelfTasteResult<string[]>>;
  addCards(
    cards: { card: TasteComposerCard; origin: "composer" }[],
    replaceIds: string[],
  ): Promise<ShelfTasteResult<{ ids: string[] }>>;
};

const ProfileSchema = z.object({
  board: TasteBoardSchema,
  version: z.number().int(),
});
const SuggestionRowSchema = z.object({
  id: z.string().uuid(),
  tile: z.string(),
  op: z.string(),
  value: z.unknown(),
  reason: z.string(),
  evidence_item_ids: z.array(z.string().uuid()),
  origin: z.enum(["learning", "composer", "preset"]).default("learning"),
  source: TasteCardSourceSchema.nullable().default(null),
});

function failure(message: string | undefined): { ok: false; error: ShelfTasteError } {
  if (message?.includes("not_authorized")) return { ok: false, error: "unauthorized" };
  if (message?.includes("not_found")) return { ok: false, error: "not_found" };
  if (message?.includes("invalid_request")) return { ok: false, error: "invalid_request" };
  return { ok: false, error: "unavailable" };
}

/** Labels for library images the composer can quote as sources. */
export async function libraryLabels(
  client: SupabaseClient,
  workspaceId: string,
  itemIds: string[],
): Promise<{ name: string; labels: InspirationLabels }[]> {
  if (itemIds.length === 0) return [];
  const { data, error } = await client
    .from("inspiration_labels")
    .select(
      "item_id,device,screen_type,patterns,theme,colors,style_words,description,inspiration_items!inner(workspace_id,status)",
    )
    .in("item_id", itemIds)
    .eq("workspace_id", workspaceId);
  if (error) return [];
  return (data ?? []).flatMap((row) => {
    const labels = InspirationLabelsSchema.safeParse({
      device: (row as { device: unknown }).device,
      screenType: (row as { screen_type: unknown }).screen_type,
      patterns: (row as { patterns: unknown }).patterns,
      theme: (row as { theme: unknown }).theme,
      colors: (row as { colors: unknown }).colors,
      styleWords: (row as { style_words: unknown }).style_words,
      description: (row as { description: unknown }).description,
    });
    return labels.success ? [{ name: "Library image", labels: labels.data }] : [];
  });
}

export function createShelfTaste(client: SupabaseClient, principal: ShelfPrincipal): ShelfTaste {
  const scope = { actor_user_id: principal.userId, target_workspace_id: principal.workspaceId };

  async function loadProfile(): Promise<ShelfTasteResult<{ board: TasteBoard; version: number } | null>> {
    const profile = await client.rpc("capture_get_taste", scope);
    if (profile.error) return failure(profile.error.message);
    if (profile.data === null) return { ok: true, value: null };
    const parsed = ProfileSchema.safeParse(profile.data);
    if (!parsed.success) return { ok: false, error: "unavailable" };
    return {
      ok: true,
      value: {
        board: parsed.data.board,
        version: parsed.data.version,
      },
    };
  }

  async function snapshot(): Promise<ShelfTasteResult<ShelfTasteSnapshot | null>> {
    const profile = await loadProfile();
    if (!profile.ok) return profile;
    if (!profile.value) return { ok: true, value: null };
    const list = await client.rpc("capture_list_taste_suggestions", scope);
    if (list.error) return failure(list.error.message);
    const rows = z.array(SuggestionRowSchema).safeParse(list.data);
    if (!rows.success) return { ok: false, error: "unavailable" };
    return {
      ok: true,
      value: {
        board: profile.value.board,
        version: profile.value.version,
        pending: rows.data.flatMap((row) => {
          const op = TasteOperationSchema.safeParse({ tile: row.tile, op: row.op, value: row.value });
          return op.success
            ? [{
                id: row.id,
                tile: op.data.tile,
                op: op.data.op,
                value: op.data.value,
                reason: row.reason,
                evidenceItemIds: row.evidence_item_ids,
                origin: row.origin,
                source: row.source,
              }]
            : [];
        }),
      },
    };
  }

  return {
    get: snapshot,

    async saveTile({ tile, value, expectedVersion }) {
      // Profile only — saveTile does not need pending suggestions.
      const current = await loadProfile();
      if (!current.ok) return current;
      if (!current.value) return { ok: false, error: "not_found" };
      const next = TasteBoardSchema.safeParse({ ...current.value.board, [tile]: value });
      if (!next.success) return { ok: false, error: "invalid_request" };
      const { data, error } = await client.rpc("capture_save_taste_board", {
        ...scope,
        new_board: next.data,
        expected_version: expectedVersion,
        lock_tile: tile,
      });
      if (error) return failure(error.message);
      return typeof data === "number" ? { ok: true, value: { version: data } } : { ok: false, error: "conflict" };
    },

    async decide({ suggestionId, decision, expectedVersion }) {
      const current = await snapshot();
      if (!current.ok) return current;
      if (!current.value) return { ok: false, error: "not_found" };
      const card = current.value.pending.find((item) => item.id === suggestionId);
      const op = card ? TasteOperationSchema.safeParse({ tile: card.tile, op: card.op, value: card.value }) : null;
      // An unknown or already-decided card still goes to SQL, which answers with its stored status.
      const board =
        op?.success === true
          ? decision === "kept"
            ? (applyTasteOperation(current.value.board, op.data) ?? current.value.board)
            : withRejectedAvoid(current.value.board, op.data)
          : current.value.board;
      const { data, error } = await client.rpc("capture_decide_taste_suggestion", {
        actor_user_id: principal.userId,
        target_suggestion_id: suggestionId,
        decision,
        new_board: board,
        expected_version: expectedVersion,
      });
      if (error) return failure(error.message);
      const status = z.enum(["kept", "rejected", "superseded"]).safeParse(data);
      return status.success ? { ok: true, value: { status: status.data } } : { ok: true, value: { status: "superseded" } };
    },

    async resetTile(tile) {
      const { error } = await client.rpc("capture_clear_taste_lock", { ...scope, lock_tile: tile });
      return error ? failure(error.message) : { ok: true, value: { tile } };
    },

    async rejectedKeys() {
      const { data, error } = await client.rpc("capture_rejected_taste_keys", scope);
      if (error) return failure(error.message);
      const keys = z.array(z.string()).safeParse(data);
      return keys.success ? { ok: true, value: keys.data } : { ok: false, error: "unavailable" };
    },

    async addCards(entries, replaceIds) {
      const cards = entries.map(({ card, origin }) => ({
        tile: card.tile,
        op: card.op,
        value: card.value,
        value_key: tasteValueKey({ tile: card.tile, op: card.op, value: card.value } as TasteOperation),
        reason: card.reason,
        source: card.source,
        origin,
      }));
      const { data, error } = await client.rpc("capture_add_taste_cards", { ...scope, cards, replace_ids: replaceIds });
      if (error) return failure(error.message);
      const ids = z.array(z.string().uuid()).safeParse(data);
      return ids.success ? { ok: true, value: { ids: ids.data } } : { ok: false, error: "unavailable" };
    },
  };
}

// Demo mode (MELD_E2E_FAKE_*): reuses the in-memory taste fake the web tab already uses.
export function createFakeShelfTaste(_principal: ShelfPrincipal): ShelfTaste {
  async function snapshot(): Promise<ShelfTasteResult<ShelfTasteSnapshot | null>> {
    const { fakeGetTasteView, fakePendingCards } = await import("./taste/taste-fake");
    const view = await fakeGetTasteView();
    if (view.status !== "ready") return { ok: true, value: null };
    const pending = fakePendingCards();
    return {
      ok: true,
      value: {
        board: view.board,
        version: view.version,
        pending: pending.map((card) => ({
          id: card.id,
          tile: card.op.tile,
          op: card.op.op,
          value: card.op.value,
          reason: card.reason,
          evidenceItemIds: [] as string[],
          origin: card.origin ?? "learning",
          source: card.source ?? null,
        })),
      },
    };
  }
  return {
    get: snapshot,
    async saveTile({ tile, value, expectedVersion }) {
      const { fakeSaveTile } = await import("./taste/taste-fake");
      const out = await fakeSaveTile({ tile, value, expectedVersion });
      return out.status === "saved" ? { ok: true, value: { version: out.version } } : { ok: false, error: out.status === "conflict" ? "conflict" : "invalid_request" };
    },
    async decide({ suggestionId, decision }) {
      const { fakeDecide } = await import("./taste/taste-fake");
      const out = await fakeDecide({ suggestionId, decision });
      return out.status === "error" ? { ok: false, error: "not_found" } : { ok: true, value: { status: out.status } };
    },
    async resetTile(tile) {
      return { ok: true, value: { tile } };
    },
    async rejectedKeys() {
      return { ok: true, value: [] };
    },
    async addCards(entries, replaceIds) {
      const { fakeAddCards } = await import("./taste/taste-fake");
      const ids = fakeAddCards(
        entries.map(({ card, origin }) => ({
          op: { tile: card.tile, op: card.op, value: card.value } as TasteOperation,
          reason: card.reason,
          origin,
          source: card.source,
        })),
        replaceIds,
      );
      return { ok: true, value: { ids } };
    },
  };
}
