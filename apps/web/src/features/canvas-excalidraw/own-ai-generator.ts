import type { AITaskStatus } from "@meld/contracts";
import type { SketchLayout } from "@meld/prototype";
import { toSketchLayout } from "./sketch-layout-adapter";
import { OwnAiUnavailable, type FallbackReason, type ScreenGenerator } from "./screen-generator";

export type OwnAiDeps = {
  start(input: { name: string; instruction: string; layout: SketchLayout }): Promise<
    { status: "queued"; taskId: string; screenId: string } | { status: "error"; message: string }
  >;
  generation(taskId: string): Promise<{ versionId: string | null } | null>;
  taskStatus(taskId: string): Promise<{ status: AITaskStatus; provider: string } | null>;
  loadDocument(screenId: string): Promise<string | null>;
  // Best effort: stops a queued task we are walking away from, so it cannot
  // finish later (paid twice, stray screen in the room) after DeepSeek built it.
  cancel?(taskId: string): Promise<unknown>;
  wait?(ms: number): Promise<void>;
};

const BAD_END: Partial<Record<AITaskStatus, FallbackReason>> = {
  usage_limit_reached: "usage_limit",
  needs_reauthentication: "needs_sign_in",
  failed: "failed",
  cancelled: "failed",
  needs_review: "failed",
};

async function cancelQuietly(deps: OwnAiDeps, taskId: string): Promise<void> {
  try {
    await deps.cancel?.(taskId);
  } catch {
    // The reason we are leaving stays the reason; a failed cancel only loses the cleanup.
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createOwnAiGenerator(
  deps: OwnAiDeps,
  options: { pollMs?: number; maxPolls?: number; maxWaitingPolls?: number } = {},
): ScreenGenerator {
  const pollMs = options.pollMs ?? 2000;
  const maxPolls = options.maxPolls ?? 150; // 5 minutes at 2 s
  const maxWaitingPolls = options.maxWaitingPolls ?? 8; // ~16 s with no device
  const wait = deps.wait ?? sleep;

  return async ({ request, instruction, signal }) => {
    const aborted = () => new DOMException("Cancelled", "AbortError");
    if (signal?.aborted) throw aborted();
    const started = await deps.start({ name: "Sketch screen", instruction, layout: toSketchLayout(request) });
    if (started.status === "error") throw new OwnAiUnavailable("no_connection", started.message);

    // From here the task exists in the owner's queue. Any way out other than a
    // finished screen or a status the task itself settled on must cancel it.
    let settledByTask = false;
    try {
      let waiting = 0;
      for (let poll = 0; poll < maxPolls; poll += 1) {
        if (signal?.aborted) throw aborted();
        const generation = await deps.generation(started.taskId);
        const status = await deps.taskStatus(started.taskId);
        if (generation?.versionId) {
          const html = await deps.loadDocument(started.screenId);
          if (!html) throw new OwnAiUnavailable("failed", "The built screen could not be loaded");
          return { screenId: `own-${started.screenId.slice(0, 8)}`, html, provider: status?.provider ?? null };
        }
        const bad = status ? BAD_END[status.status] : undefined;
        if (bad) {
          settledByTask = true;
          throw new OwnAiUnavailable(bad);
        }
        waiting = status?.status === "waiting_for_device" ? waiting + 1 : 0;
        if (waiting >= maxWaitingPolls) throw new OwnAiUnavailable("no_connection", "No device picked the task up");
        await wait(pollMs);
      }
      throw new OwnAiUnavailable("timeout");
    } catch (error) {
      if (!settledByTask) await cancelQuietly(deps, started.taskId);
      throw error;
    }
  };
}
