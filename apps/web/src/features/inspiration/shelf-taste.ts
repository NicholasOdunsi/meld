// shelf-taste.ts
import "server-only";

import {
  applyTasteOperation,
  TasteBoardSchema,
  TasteOperationSchema,
  type ShelfErrorCode,
  type ShelfTasteSnapshot,
  type TasteBoard,
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
  setAppleRules(enabled: boolean): Promise<ShelfTasteResult<{ enabled: boolean }>>;
};

const ProfileSchema = z.object({
  board: TasteBoardSchema,
  version: z.number().int(),
  apple_rules: z.boolean(),
});
const SuggestionRowSchema = z.object({
  id: z.string().uuid(),
  tile: z.string(),
  op: z.string(),
  value: z.unknown(),
  reason: z.string(),
  evidence_item_ids: z.array(z.string().uuid()),
});

function failure(message: string | undefined): { ok: false; error: ShelfTasteError } {
  if (message?.includes("not_authorized")) return { ok: false, error: "unauthorized" };
  if (message?.includes("not_found")) return { ok: false, error: "not_found" };
  if (message?.includes("invalid_request")) return { ok: false, error: "invalid_request" };
  return { ok: false, error: "unavailable" };
}

export function createShelfTaste(client: SupabaseClient, principal: ShelfPrincipal): ShelfTaste {
  const scope = { actor_user_id: principal.userId, target_workspace_id: principal.workspaceId };

  async function loadProfile(): Promise<ShelfTasteResult<{ board: TasteBoard; version: number; appleRules: boolean } | null>> {
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
        appleRules: parsed.data.apple_rules,
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
        appleRules: profile.value.appleRules,
        pending: rows.data.flatMap((row) => {
          const op = TasteOperationSchema.safeParse({ tile: row.tile, op: row.op, value: row.value });
          return op.success
            ? [{ id: row.id, tile: op.data.tile, op: op.data.op, value: op.data.value, reason: row.reason, evidenceItemIds: row.evidence_item_ids }]
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

    async setAppleRules(enabled) {
      const { error } = await client.rpc("capture_set_apple_rules", { ...scope, enabled });
      return error ? failure(error.message) : { ok: true, value: { enabled } };
    },
  };
}

// Demo mode (MELD_E2E_FAKE_*): reuses the in-memory taste fake the web tab already uses.
export function createFakeShelfTaste(_principal: ShelfPrincipal): ShelfTaste {
  async function snapshot(): Promise<ShelfTasteResult<ShelfTasteSnapshot | null>> {
    const { fakeGetTasteView, fakeAppleRules } = await import("./taste/taste-fake");
    const view = await fakeGetTasteView();
    if (view.status !== "ready") return { ok: true, value: null };
    return {
      ok: true,
      value: {
        board: view.board,
        version: view.version,
        appleRules: fakeAppleRules(),
        pending: view.pending.map((card) => ({
          id: card.id,
          tile: card.tile,
          op: "set" as const,
          value: null,
          reason: card.reason,
          evidenceItemIds: card.evidence.map((e) => e.id),
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
    async setAppleRules(enabled) {
      const { fakeSetAppleRules } = await import("./taste/taste-fake");
      fakeSetAppleRules(enabled);
      return { ok: true, value: { enabled } };
    },
  };
}
