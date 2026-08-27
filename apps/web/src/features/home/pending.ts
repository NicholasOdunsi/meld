import type { MeldPendingKind } from "@/ui/meld/kind-chip";
import type { AttentionKind } from "./attention/types";

// The ticket prints four chips; the attention registry knows about more
// kinds than that. `decision_needed` and `assigned_work` have no resolver
// wired (see the design doc), so their mapping only matters if one is added
// later -- review is the safe default because it never claims an action the
// deck cannot perform.
const KINDS: Record<AttentionKind, MeldPendingKind> = {
  mention: "review",
  assigned_work: "review",
  decision_needed: "review",
  approval_request: "approve",
  agent_result_review: "approve",
  agent_run_failed: "failed",
  room_idle: "stale",
};

export function toPendingKind(kind: AttentionKind): MeldPendingKind {
  return KINDS[kind] ?? "review";
}
