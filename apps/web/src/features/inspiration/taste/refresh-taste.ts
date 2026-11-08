import "server-only";

import {
  InspirationLabelsSchema,
  TasteBoardSchema,
  TASTE_SIGNAL_REASONS,
  type TasteSignalReason,
} from "@meld/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { computeTasteStats, type TasteLabelRow } from "./compute-taste-stats";
import { TasteWriterError, type TasteWriter } from "./deepseek-taste-writer";
import { filterSuggestions } from "./filter-suggestions";

const LIBRARY_LIMIT = 1000;
const REJECTED_LIMIT = 200;

const ClaimSchema = z.array(
  z.object({
    is_first: z.boolean(),
    sorted_count: z.number().int(),
    board: z.unknown(),
    locks: z.record(z.string(), z.number()),
    version: z.number().int(),
    last_refresh_at: z.string().nullable(),
  }),
);
const LabelRowsSchema = z.array(
  z.object({
    item_id: z.string().uuid(),
    device: z.string(),
    screen_type: z.string(),
    patterns: z.array(z.string()),
    theme: z.string(),
    colors: z.array(z.string()),
    style_words: z.array(z.string()),
    description: z.string(),
    updated_at: z.string(),
  }),
);

export type RefreshOutcome = "skipped" | "first_board" | "suggested" | "failed";

async function loadOwnLabels(client: SupabaseClient, workspaceId: string, userId: string): Promise<TasteLabelRow[]> {
  const { data, error } = await client
    .from("inspiration_labels")
    .select(
      "item_id,device,screen_type,patterns,theme,colors,style_words,description,updated_at,inspiration_items!inner(created_by,status)",
    )
    .eq("workspace_id", workspaceId)
    .eq("status", "sorted")
    .eq("inspiration_items.created_by", userId)
    .eq("inspiration_items.status", "ready")
    .order("updated_at", { ascending: false })
    .limit(LIBRARY_LIMIT);
  if (error) throw new Error("labels_read_failed");
  const rows = LabelRowsSchema.parse((data ?? []).map((row) => ({ ...(row as object), inspiration_items: undefined })));
  return rows.flatMap((row) => {
    const labels = InspirationLabelsSchema.safeParse({
      device: row.device,
      screenType: row.screen_type,
      patterns: row.patterns,
      theme: row.theme,
      colors: row.colors,
      styleWords: row.style_words,
      description: row.description,
    });
    return labels.success ? [{ itemId: row.item_id, sortedAt: row.updated_at, labels: labels.data }] : [];
  });
}

/** Spec C5: claim → stats → writer → filter → finish. Writes nothing on failure. */
export async function refreshTaste(
  workspaceId: string,
  userId: string,
  { client, writer }: { client: SupabaseClient; writer: TasteWriter },
): Promise<RefreshOutcome> {
  const ids = { target_workspace_id: workspaceId, target_user_id: userId };
  const claimed = await client.rpc("claim_taste_refresh", ids);
  const claim = ClaimSchema.safeParse(claimed.data);
  if (claimed.error || !claim.success || claim.data.length === 0) return "skipped";
  const profile = claim.data[0];

  try {
    const rows = await loadOwnLabels(client, workspaceId, userId);
    const stats = computeTasteStats(rows);

    if (profile.is_first) {
      const board = await writer.firstBoard({ stats, board: null, locks: {}, rejectedKeys: [], redoSignals: [] });
      const finished = await client.rpc("finish_taste_refresh", {
        ...ids,
        first_board: board,
        new_suggestions: null,
        sorted_count: profile.sorted_count,
      });
      if (finished.error) throw new Error("finish_failed");
      return "first_board";
    }

    const board = TasteBoardSchema.parse(profile.board);
    const rejected = await client
      .from("taste_suggestions")
      .select("value_key")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .eq("status", "rejected")
      .order("created_at", { ascending: false })
      .limit(REJECTED_LIMIT);
    const signals = await client
      .from("taste_signals")
      .select("reason")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .gt("created_at", profile.last_refresh_at ?? "1970-01-01T00:00:00.000Z");
    if (rejected.error || signals.error) throw new Error("history_read_failed");

    const rejectedKeys = (rejected.data ?? []).map((row) => String((row as { value_key: string }).value_key));
    const counts = new Map<TasteSignalReason, number>();
    for (const row of signals.data ?? []) {
      const reason = (row as { reason: string }).reason as TasteSignalReason;
      if ((TASTE_SIGNAL_REASONS as readonly string[]).includes(reason)) counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
    const redoSignals = [...counts].map(([reason, count]) => ({ reason, count }));

    // Only locks still in force (fewer than 5 images sorted since) are shown to
    // the writer; filterSuggestions enforces the same rule regardless.
    const activeLocks = Object.fromEntries(
      Object.entries(profile.locks).filter(([, lockedAt]) => profile.sorted_count - lockedAt < 5),
    );
    const suggestions = await writer.suggest({ stats, board, locks: activeLocks, rejectedKeys, redoSignals });
    const ready = filterSuggestions(suggestions, {
      board,
      locks: profile.locks,
      sortedCount: profile.sorted_count,
      rejectedKeys: new Set(rejectedKeys),
      ownItemIds: new Set(rows.map((row) => row.itemId)),
    });
    const finished = await client.rpc("finish_taste_refresh", {
      ...ids,
      first_board: null,
      new_suggestions: ready.map((s) => ({
        tile: s.tile,
        op: s.op,
        value: s.value,
        valueKey: s.valueKey,
        reason: s.reason,
        evidenceItemIds: s.evidenceItemIds,
      })),
      sorted_count: profile.sorted_count,
    });
    if (finished.error) throw new Error("finish_failed");
    return "suggested";
  } catch (error) {
    console.error("taste refresh failed", {
      workspaceId,
      code: error instanceof TasteWriterError ? error.code : error instanceof Error ? error.message : "unknown",
    });
    await client.rpc("release_taste_refresh", ids).then(undefined, () => undefined);
    return "failed";
  }
}
