// apps/web/src/features/inspiration/taste/taste-actions.ts
"use server";

import {
  applyTasteOperation,
  TASTE_LIMITS,
  TASTE_SIGNAL_REASONS,
  TASTE_TILES,
  TasteBoardSchema,
  TasteOperationSchema,
  type TasteBoard,
  type TasteOperation,
  type TasteSignalReason,
  type TasteTile,
} from "@meld/contracts";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { INSPIRATION_ITEM_COLUMNS, toViews } from "../inspiration-shared";
import { createInspirationStorage } from "../inspiration-storage";
import { describeSuggestion, tasteValueLabel } from "./describe-suggestion";

export type TasteSuggestionView = {
  id: string;
  tile: TasteTile;
  headline: string;
  reason: string;
  evidence: { id: string; imageUrl: string | null }[];
};
export type TasteView =
  | { status: "ready"; board: TasteBoard; version: number; pending: TasteSuggestionView[] }
  | { status: "learning"; sortedCount: number; needed: number }
  | { status: "off" };
export type SaveTasteResult = { status: "saved"; version: number } | { status: "conflict" | "invalid" | "error" };

const FIRST_BOARD_MIN_IMAGES = 8;
const Uuid = z.string().uuid();
const SuggestionRowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  tile: z.string(),
  op: z.string(),
  value: z.unknown(),
  status: z.string(),
  reason: z.string().optional(),
  evidence_item_ids: z.array(z.string().uuid()).optional(),
});

function toOperation(row: { tile: string; op: string; value: unknown }): TasteOperation | null {
  const parsed = TasteOperationSchema.safeParse({ tile: row.tile, op: row.op, value: row.value });
  return parsed.success ? parsed.data : null;
}

async function readProfile(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string) {
  const { data, error } = await supabase
    .from("taste_profiles")
    .select("board,version")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  const board = TasteBoardSchema.safeParse((data as { board: unknown }).board);
  return board.success ? { board: board.data, version: Number((data as { version: number }).version) } : null;
}

export async function getTasteView(workspaceId: string): Promise<TasteView> {
  if (!Uuid.safeParse(workspaceId).success) return { status: "off" };
  if (isRoomFakeEnabled()) {
    const { fakeGetTasteView } = await import("./taste-fake");
    return fakeGetTasteView();
  }
  const supabase = await createClient(new Headers());
  const profile = await readProfile(supabase, workspaceId);
  if (!profile) {
    if (!process.env.DEEPSEEK_API_KEY) return { status: "off" };
    const { data: auth } = await supabase.auth.getUser();
    const { count } = await supabase
      .from("inspiration_labels")
      .select("item_id,inspiration_items!inner(created_by,status)", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "sorted")
      .eq("inspiration_items.created_by", auth.user?.id ?? "")
      .eq("inspiration_items.status", "ready");
    return { status: "learning", sortedCount: count ?? 0, needed: FIRST_BOARD_MIN_IMAGES };
  }

  const { data: rows } = await supabase
    .from("taste_suggestions")
    .select("id,workspace_id,tile,op,value,status,reason,evidence_item_ids")
    .eq("workspace_id", workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const suggestions = z.array(SuggestionRowSchema).safeParse(rows ?? []);
  const pendingRows = suggestions.success ? suggestions.data : [];

  const evidenceIds = [...new Set(pendingRows.flatMap((row) => row.evidence_item_ids ?? []))];
  const imageUrlById = new Map<string, string | null>();
  if (evidenceIds.length > 0) {
    const { data: items } = await supabase.from("inspiration_items").select(INSPIRATION_ITEM_COLUMNS).in("id", evidenceIds);
    for (const view of await toViews(items ?? [], createInspirationStorage(supabase))) imageUrlById.set(view.id, view.imageUrl);
  }

  const pending = pendingRows.flatMap((row): TasteSuggestionView[] => {
    const op = toOperation(row);
    if (!op) return [];
    return [
      {
        id: row.id,
        tile: op.tile,
        headline: describeSuggestion(op, profile.board),
        reason: row.reason ?? "",
        evidence: (row.evidence_item_ids ?? []).map((id) => ({ id, imageUrl: imageUrlById.get(id) ?? null })),
      },
    ];
  });
  return { status: "ready", board: profile.board, version: profile.version, pending };
}

export async function hasPendingTasteSuggestions(workspaceId: string): Promise<boolean> {
  if (!Uuid.safeParse(workspaceId).success) return false;
  if (isRoomFakeEnabled()) {
    const { fakeHasPending } = await import("./taste-fake");
    return fakeHasPending();
  }
  const supabase = await createClient(new Headers());
  const { count } = await supabase
    .from("taste_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "pending");
  return (count ?? 0) > 0;
}

/** Not me on an add records the value as a dislike (spec B3). */
function withRejectedAvoid(board: TasteBoard, op: TasteOperation): TasteBoard {
  if (op.op !== "add" || op.tile === "avoid") return board;
  const next = applyTasteOperation(board, {
    tile: "avoid",
    op: "add",
    value: { text: tasteValueLabel(op).slice(0, 80), source: "rejected" },
  });
  return next ?? board;
}

const DecideInput = z.object({ suggestionId: Uuid, decision: z.enum(["kept", "rejected"]) }).strict();

export async function decideTasteSuggestion(
  input: z.input<typeof DecideInput>,
): Promise<{ status: "kept" | "rejected" | "superseded" | "error" }> {
  const parsed = DecideInput.safeParse(input);
  if (!parsed.success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const { fakeDecide } = await import("./taste-fake");
    return fakeDecide(parsed.data);
  }
  const supabase = await createClient(new Headers());
  const { data: row } = await supabase
    .from("taste_suggestions")
    .select("id,workspace_id,tile,op,value,status")
    .eq("id", parsed.data.suggestionId)
    .maybeSingle();
  const suggestion = SuggestionRowSchema.safeParse(row);
  if (!suggestion.success) return { status: "error" };
  const profile = await readProfile(supabase, suggestion.data.workspace_id);
  const op = toOperation(suggestion.data);
  if (!profile || !op) return { status: "error" };

  const newBoard =
    parsed.data.decision === "kept" ? applyTasteOperation(profile.board, op) : withRejectedAvoid(profile.board, op);
  const { data, error } = await supabase.rpc("decide_taste_suggestion", {
    target_suggestion_id: parsed.data.suggestionId,
    decision: parsed.data.decision,
    new_board: newBoard,
    expected_version: profile.version,
  });
  if (error) {
    console.error("decide_taste_suggestion failed", { code: error.code });
    return { status: "error" };
  }
  const status = z.enum(["kept", "rejected", "superseded"]).safeParse(data);
  return status.success ? { status: status.data } : { status: "superseded" };
}

const TileInput = z
  .object({ workspaceId: Uuid, tile: z.enum(TASTE_TILES), value: z.unknown(), expectedVersion: z.number().int().min(0) })
  .strict();

async function writeBoard(
  workspaceId: string,
  next: unknown,
  expectedVersion: number,
  lockTile: TasteTile | null,
): Promise<SaveTasteResult> {
  const board = TasteBoardSchema.safeParse(next);
  if (!board.success) return { status: "invalid" };
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("save_taste_board", {
    target_workspace_id: workspaceId,
    new_board: board.data,
    expected_version: expectedVersion,
    lock_tile: lockTile,
  });
  if (error) {
    console.error("save_taste_board failed", { code: error.code });
    return { status: "error" };
  }
  return typeof data === "number" ? { status: "saved", version: data } : { status: "conflict" };
}

export async function saveTasteTile(input: z.input<typeof TileInput>): Promise<SaveTasteResult> {
  const parsed = TileInput.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  if (isRoomFakeEnabled()) {
    const { fakeSaveTile } = await import("./taste-fake");
    return fakeSaveTile(parsed.data);
  }
  const supabase = await createClient(new Headers());
  const profile = await readProfile(supabase, parsed.data.workspaceId);
  if (!profile) return { status: "error" };
  return writeBoard(
    parsed.data.workspaceId,
    { ...profile.board, [parsed.data.tile]: parsed.data.value },
    parsed.data.expectedVersion,
    parsed.data.tile,
  );
}

const DislikeInput = z
  .object({ workspaceId: Uuid, text: z.string().trim().min(1).max(80), expectedVersion: z.number().int().min(0) })
  .strict();

export async function addTasteDislike(input: z.input<typeof DislikeInput>): Promise<SaveTasteResult> {
  const parsed = DislikeInput.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  if (isRoomFakeEnabled()) {
    const { fakeAddDislike } = await import("./taste-fake");
    return fakeAddDislike(parsed.data);
  }
  const supabase = await createClient(new Headers());
  const profile = await readProfile(supabase, parsed.data.workspaceId);
  if (!profile) return { status: "error" };
  if (profile.board.avoid.length >= TASTE_LIMITS.avoid.max) return { status: "invalid" };
  const next = applyTasteOperation(profile.board, {
    tile: "avoid",
    op: "add",
    value: { text: parsed.data.text, source: "typed" },
  });
  if (!next) return { status: "invalid" };
  // Typed dislikes do not lock the avoid tile (spec B4).
  return writeBoard(parsed.data.workspaceId, next, parsed.data.expectedVersion, null);
}

const SignalInput = z.object({ screenId: Uuid, reason: z.enum(TASTE_SIGNAL_REASONS) }).strict();

export async function recordTasteSignal(input: {
  screenId: string;
  reason: TasteSignalReason;
}): Promise<{ status: "saved" | "error" }> {
  const parsed = SignalInput.safeParse(input);
  if (!parsed.success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const { fakeRecordSignal } = await import("./taste-fake");
    return fakeRecordSignal(parsed.data);
  }
  const supabase = await createClient(new Headers());
  const { error } = await supabase.rpc("record_taste_signal", {
    target_screen_id: parsed.data.screenId,
    signal_reason: parsed.data.reason,
  });
  if (error) {
    console.error("record_taste_signal failed", { code: error.code });
    return { status: "error" };
  }
  return { status: "saved" };
}
