import type { AITaskStatus } from "@meld/contracts";

/**
 * Where a design-system distillation has got to.
 *
 * Distilling takes minutes, and the banner used to say one unchanging thing
 * ("Distilling your design system…") for the whole of it -- so there was no
 * way to tell a job that was working from one that was wedged, and no moment
 * that announced it had finished.
 *
 * Every phase here is backed by something actually observable. There is no
 * progress column on `ai_tasks`, and the connector reports no sub-steps, so
 * this deliberately does NOT invent stages like "extracting colours" that
 * nothing could confirm. What it does have is real: the browser knows when it
 * is still sending bytes, and the room's task-status projection reports when
 * a device has picked the task up.
 */
export type DistillPhase =
  | "uploading"
  | "queued"
  | "reading"
  | "done"
  | "failed";

/** The phases that render as a step list, in the order they happen. */
export const DISTILL_STEPS: readonly {
  phase: Extract<DistillPhase, "uploading" | "queued" | "reading">;
  label: string;
}[] = [
  { phase: "uploading", label: "Uploading your file" },
  // Named for what the person can act on. "queued" is the internal word; what
  // it means to them is that their connector has not picked the job up yet,
  // which is the one thing at this stage they might need to go fix.
  { phase: "queued", label: "Waiting for your connector" },
  { phase: "reading", label: "Reading your design system" },
];

/**
 * Splits an accepted-but-unfinished task into "nobody has started it" and
 * "a device is working on it".
 *
 * `running` is the only status that means a device has the task in hand.
 * `queued`/`waiting_for_device`/`ready_to_run` all mean it is still sitting
 * there, and an absent status means the projection has not caught up yet --
 * which is also "not started", so it groups with them rather than claiming
 * progress that has not happened.
 */
export function phaseFromTaskStatus(
  status: AITaskStatus | undefined,
): Extract<DistillPhase, "queued" | "reading"> {
  return status === "running" ? "reading" : "queued";
}

export type StepState = "done" | "active" | "pending";

/**
 * How one step should read given the phase the job is actually in.
 *
 * Steps before the current one are done, because the phases only ever move
 * forward -- reaching `reading` means the upload finished and a device picked
 * it up, whether or not the browser saw each moment. `done` completes all of
 * them; `failed` freezes the list rather than marking anything complete, since
 * we cannot tell from here how far it got.
 */
export function stepState(
  step: DistillPhase,
  phase: DistillPhase,
): StepState {
  if (phase === "done") return "done";
  const order = DISTILL_STEPS.map((entry) => entry.phase);
  const stepIndex = order.indexOf(step as (typeof order)[number]);
  const phaseIndex = order.indexOf(phase as (typeof order)[number]);
  if (stepIndex === -1 || phaseIndex === -1) return "pending";
  if (stepIndex < phaseIndex) return "done";
  return stepIndex === phaseIndex ? "active" : "pending";
}
