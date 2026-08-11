import { isTerminalTaskStatus } from "@/features/ai/room-task-status";
import type { PrdAssistRequest } from "./schemas";

// What one assist request turned out to be. Derived from persisted fields
// only -- the Product Agent is never asked to label its own output, so a model
// cannot talk its way into an outcome the data does not support.
export type PrdAssistOutcome =
  | "pending"
  | "answer"
  | "edit"
  | "answer_and_edit"
  | "clarification"
  | "failed";

export function prdAssistOutcome(request: PrdAssistRequest): PrdAssistOutcome {
  if (request.status === "pending") return "pending";

  // The retry window. resolve_ai_task('retry') sends a needs_review,
  // needs_reauthentication or usage_limit_reached task back to ready_to_run,
  // but the request row keeps status = 'failed' and the previous run's
  // error_code until the retried run settles. Reading the request alone would
  // show a permanent failure over a request that is genuinely in flight, so the
  // task's own status -- equally persisted -- breaks the tie.
  if (request.status === "failed") {
    return isTerminalTaskStatus(request.taskStatus) ? "failed" : "pending";
  }

  // ready or dismissed: the settled content names the outcome. A dismissed
  // request still has one; `status` is what says the user closed it.
  if (request.clarifyingQuestion !== null) return "clarification";
  const answered = request.answer !== null;
  const proposed = request.proposalId !== null;
  if (answered && proposed) return "answer_and_edit";
  if (answered) return "answer";
  if (proposed) return "edit";

  // Settled with nothing to show. One case reaches here: an edit-only result
  // whose target section already had another active proposal, so the edit half
  // was refused (proposalErrorCode says why) and there was no answer half to
  // keep. Nothing usable came back, which is what "failed" means to a reader.
  return "failed";
}
