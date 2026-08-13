import {
  ManualChecklistItemKeySchema,
  type ManualChecklistItemKey,
  type RoomStage,
} from "@meld/contracts";

// Ordered so "the stage before/after X" is just an index shift. Mirrors the
// persisted `public.room_stage` enum.
export const STAGE_ORDER = [
  "discovery",
  "define",
  "design",
  "development",
] as const satisfies readonly RoomStage[];

// Everything the checklist needs to decide what is done. Auto items read these
// signals; manual items read `manualChecks`. Keeping this a flat bag (rather
// than letting the UI reach into repositories) is what makes the whole engine a
// pure function we can exhaustively test.
export type StageReadinessSignals = {
  participantCount: number;
  // Discovery signals: someone has spoken, and an agent has replied. Together
  // they are the heuristic for a framed problem — a real exchange happened.
  hasHumanMessage: boolean;
  hasAgentReply: boolean;
  hasPrd: boolean;
  prdStatus: "draft" | "accepted" | null;
  userFlowCount: number;
  decisionCount: number;
  designAssetCount: number;
  manualChecks: Record<ManualChecklistItemKey, boolean>;
};

export type ChecklistItemKind = "auto" | "manual";

export type ChecklistItem = {
  key: string;
  label: string;
  kind: ChecklistItemKind;
  done: boolean;
  // Short status shown under the label ("3 recorded", "draft"). Null when the
  // label alone says enough.
  detail: string | null;
  // Whether this item must be done for the stage to count as ready to move on.
  // Supporting items still show progress but do not gate the move.
  required: boolean;
  // Manual items carry the persisted key so the UI can toggle them.
  manualKey: ManualChecklistItemKey | null;
};

export type StageChecklist = {
  stage: RoomStage;
  previousStage: RoomStage | null;
  nextStage: RoomStage | null;
  // Development has no "next" — the panel shows a handoff summary instead of a
  // move-forward checklist.
  isTerminal: boolean;
  items: ChecklistItem[];
  doneCount: number;
  totalCount: number;
  ratio: number;
  isReady: boolean;
};

// No manual item confirmed. The persisted table only holds confirmed items, so
// this is the starting point both backends fill in from the rows they find.
export function emptyManualChecks(): Record<ManualChecklistItemKey, boolean> {
  return { problem_framed: false, design_reviewed: false };
}

// Fold persisted item-key rows into the flat record the engine reads. Unknown
// keys (e.g. an item removed in a later release) are ignored rather than trusted.
export function manualChecksFromKeys(
  keys: readonly string[],
): Record<ManualChecklistItemKey, boolean> {
  const checks = emptyManualChecks();
  for (const key of keys) {
    const parsed = ManualChecklistItemKeySchema.safeParse(key);
    if (parsed.success) checks[parsed.data] = true;
  }
  return checks;
}

export function stageBefore(stage: RoomStage): RoomStage | null {
  const index = STAGE_ORDER.indexOf(stage);
  return index > 0 ? STAGE_ORDER[index - 1] : null;
}

export function stageAfter(stage: RoomStage): RoomStage | null {
  const index = STAGE_ORDER.indexOf(stage);
  return index >= 0 && index < STAGE_ORDER.length - 1
    ? STAGE_ORDER[index + 1]
    : null;
}

function auto(
  key: string,
  label: string,
  done: boolean,
  detail: string | null,
  required = false,
): ChecklistItem {
  return { key, label, kind: "auto", done, detail, required, manualKey: null };
}

function manual(
  key: ManualChecklistItemKey,
  label: string,
  signals: StageReadinessSignals,
  detail: string | null = null,
  required = true,
): ChecklistItem {
  return {
    key,
    label,
    kind: "manual",
    done: signals.manualChecks[key] === true,
    detail,
    required,
    manualKey: key,
  };
}

function countDetail(count: number, noun: string, empty: string): string {
  return count > 0 ? `${count} ${noun}` : empty;
}

function stageItems(
  stage: RoomStage,
  signals: StageReadinessSignals,
): ChecklistItem[] {
  switch (stage) {
    case "discovery": {
      const problemFramed = signals.hasHumanMessage && signals.hasAgentReply;
      const contextDetail =
        signals.designAssetCount > 0
          ? countDetail(signals.designAssetCount, "attached", "")
          : signals.userFlowCount > 0
            ? "user flow added"
            : "upload or draw a flow";
      return [
        auto(
          "brainstorming_started",
          "Brainstorming started",
          signals.hasHumanMessage,
          signals.hasHumanMessage ? null : "start the conversation",
        ),
        // Heuristic problem framing: a real exchange (you spoke, an agent
        // replied) stands in for detecting an articulated problem.
        auto(
          "problem_framed",
          "Problem framed",
          problemFramed,
          problemFramed ? "captured from your chat" : "keep the conversation going",
          true,
        ),
        auto(
          "context_added",
          "Context added",
          signals.designAssetCount > 0 || signals.userFlowCount > 0,
          contextDetail,
        ),
      ];
    }
    case "define":
      return [
        auto(
          "prd_drafted",
          "PRD drafted",
          signals.hasPrd,
          signals.hasPrd ? "drafted" : "no PRD yet",
          true,
        ),
        auto(
          "user_journey",
          "User journey created",
          signals.userFlowCount > 0,
          "comes with the PRD",
          true,
        ),
        auto(
          "decisions_recorded",
          "Decisions recorded",
          signals.decisionCount > 0,
          countDetail(signals.decisionCount, "recorded", "none yet"),
          true,
        ),
        auto(
          "prd_accepted",
          "PRD accepted by the team",
          signals.prdStatus === "accepted",
          signals.prdStatus === "accepted" ? "accepted" : "awaiting acceptance",
          true,
        ),
      ];
    case "design":
      return [
        auto(
          "flows_refined",
          "Flows refined on the canvas",
          signals.userFlowCount > 0,
          "user flows",
          true,
        ),
        auto(
          "design_assets",
          "Design assets attached",
          signals.designAssetCount > 0,
          countDetail(signals.designAssetCount, "files", "none attached"),
          true,
        ),
        manual("design_reviewed", "Design reviewed", signals),
      ];
    case "development":
      // Terminal handoff summary — reflects what carried through, no next move.
      return [
        auto(
          "prd_journey",
          "PRD & user journey",
          signals.hasPrd,
          signals.prdStatus === "accepted" ? "final" : "draft",
        ),
        auto(
          "design_assets",
          "Design assets",
          signals.designAssetCount > 0,
          countDetail(signals.designAssetCount, "files", "none"),
        ),
        auto(
          "decisions",
          "Decisions",
          signals.decisionCount > 0,
          countDetail(signals.decisionCount, "recorded", "none"),
        ),
      ];
  }
}

export function computeStageChecklist(
  stage: RoomStage,
  signals: StageReadinessSignals,
): StageChecklist {
  const items = stageItems(stage, signals);
  const doneCount = items.filter((item) => item.done).length;
  const totalCount = items.length;
  // Ready when every required item is done; supporting items only move the ring.
  const requiredItems = items.filter((item) => item.required);
  const isReady =
    requiredItems.length > 0
      ? requiredItems.every((item) => item.done)
      : doneCount === totalCount;
  return {
    stage,
    previousStage: stageBefore(stage),
    nextStage: stageAfter(stage),
    isTerminal: stage === "development",
    items,
    doneCount,
    totalCount,
    ratio: totalCount === 0 ? 1 : doneCount / totalCount,
    isReady,
  };
}
