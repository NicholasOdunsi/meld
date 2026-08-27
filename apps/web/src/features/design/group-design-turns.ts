import type { AITaskStatus } from "@meld/contracts";
import type { DesignAgentTurn, DesignAgentTurnScreen } from "./design-agent-transcript";

/**
 * One send, however many screens it edited.
 *
 * Editing a selection queues one task per screen, so asking to recolour five
 * screens produced five tasks -- and, rendered one bubble per task, the same
 * prompt five times with five replies. One request read as spam.
 */
export type GroupedDesignTurn = Omit<DesignAgentTurn, "screens"> & {
  /** Every task in this send, so stopping one stops the whole send. */
  taskIds: string[];
  /** Every screen the send produced, in the order the tasks were queued. */
  screens: DesignAgentTurnScreen[];
};

/**
 * How close in time two tasks must be to count as one send.
 *
 * A fan-out queues its tasks in a tight loop -- the observed spread across
 * five was under two seconds. A minute is far wider than that and still far
 * narrower than a person retyping the same request, which is the case this
 * must not swallow.
 */
const SAME_SEND_WINDOW_MS = 60_000;

// Any status that is not yet terminal wins for the group: a send is still
// running while any of its tasks is, so the reply keeps saying so (and keeps
// offering a stop) until the last one lands.
const ACTIVE_STATUSES = new Set<AITaskStatus>([
  "queued",
  "waiting_for_device",
  "ready_to_run",
  "running",
]);

function isSameSend(a: DesignAgentTurn, b: DesignAgentTurn): boolean {
  if (a.initiatedBy !== b.initiatedBy) return false;
  // A chain is one ask spread over several runs: minutes apart, each with a
  // different instruction. Neither the prompt check nor the time window below
  // can see that, so the chain id decides on its own when there is one.
  if (a.chainId && b.chainId) return a.chainId === b.chainId;
  if (a.chainId || b.chainId) return false;
  // Identical words are the strongest signal -- a fan-out sends the same
  // instruction to each screen -- but only alongside the time window, or the
  // same request made deliberately an hour later would fold into the first.
  if ((a.userPrompt ?? "") !== (b.userPrompt ?? "")) return false;
  const gap = Math.abs(
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return Number.isFinite(gap) && gap <= SAME_SEND_WINDOW_MS;
}

/**
 * Folds the turns that came from a single send into one.
 *
 * A fan-out is consecutive-only: its tasks are queued in one tight loop, so a
 * matching pair either sits together or belongs to different sends with
 * something in between.
 *
 * A chain is not. Its links are minutes apart, and any other generation
 * started in between sits between them in creation order -- which split one
 * chain into several replies, each counting only its own links ("Built 2 of
 * 9", then "Built 3 of 9"). Links are gathered by chain id wherever they
 * land, into the reply where the chain began.
 */
export function groupDesignTurnsBySend(
  turns: readonly DesignAgentTurn[],
): GroupedDesignTurn[] {
  const grouped: GroupedDesignTurn[] = [];
  // The reply each chain is being collected into, so a link separated from
  // its siblings by an unrelated generation still finds its way home.
  const byChain = new Map<string, GroupedDesignTurn>();
  // The reply the turn just before this one ended up in. For an unchained
  // fan-out this is exactly the old "last group in the list" -- unchanged --
  // and holding it explicitly keeps that rule intact now that a chained turn
  // can be folded into a group that is no longer last.
  let previous: GroupedDesignTurn | null = null;
  for (const turn of turns) {
    // The reply this turn might belong to: its chain's, if it has one, or
    // else whatever the turn before it went into.
    const openGroup: GroupedDesignTurn | null = turn.chainId
      ? (byChain.get(turn.chainId) ?? null)
      : previous;
    const openTurn = openGroup
      ? ({ ...openGroup, screens: openGroup.screens } as DesignAgentTurn)
      : null;
    if (openGroup && openTurn && isSameSend(openTurn, turn)) {
      openGroup.taskIds.push(turn.taskId);
      // Tolerated rather than required: turns are also built by hand (tests,
      // optimistic rows) and a missing batch must not take the whole feed down
      // -- the bubble falls back to the originating screen anyway.
      for (const screen of turn.screens ?? []) {
        if (
          !openGroup.screens.some((existing) => existing.id === screen.id)
        ) {
          openGroup.screens.push(screen);
        }
      }
      // Any task in the send having edited an existing screen makes the whole
      // send an edit -- the person selected screens and this is one of them.
      openGroup.editedExisting =
        openGroup.editedExisting || turn.editedExisting;
      if (ACTIVE_STATUSES.has(turn.taskStatus)) {
        openGroup.taskStatus = turn.taskStatus;
        // The group is only "built" once nothing is still working.
        openGroup.screenState = "empty";
        openGroup.currentVersionId = null;
      }
      previous = openGroup;
      continue;
    }
    const group: GroupedDesignTurn = {
      ...turn,
      taskIds: [turn.taskId],
      screens: [...(turn.screens ?? [])],
    };
    grouped.push(group);
    if (turn.chainId) byChain.set(turn.chainId, group);
    previous = group;
  }
  return grouped;
}
