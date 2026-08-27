import type { RoomStage } from "@meld/contracts";
import { STAGE_ORDER } from "./stage-readiness";

/**
 * Whether a Room has earned its generated Overview tab.
 *
 * The signals and the two-artifact threshold are carried over verbatim from
 * the retired `getRoomSurfaces`, so a Room that showed an Overview *surface*
 * yesterday shows an Overview *tab* today. Deliberately unchanged: this is a
 * port, not a redesign.
 */
export type RoomArtifactState = {
  hasUserFlow: boolean;
  hasPrd: boolean;
  hasPrdTask: boolean;
  hasBuiltDesignScreen: boolean;
  decisionCount: number;
  stage: RoomStage;
};

const DESIGN_STAGE_INDEX = STAGE_ORDER.indexOf("design");

export function countArtifacts(state: RoomArtifactState): number {
  let count = 0;
  if (state.hasUserFlow) count += 1;
  if (state.hasPrd || state.hasPrdTask) count += 1;
  if (state.decisionCount > 0) count += 1;
  if (
    state.hasBuiltDesignScreen ||
    STAGE_ORDER.indexOf(state.stage) >= DESIGN_STAGE_INDEX
  ) {
    count += 1;
  }
  return count;
}

export function hasOverviewTab(state: RoomArtifactState): boolean {
  return countArtifacts(state) >= 2;
}
