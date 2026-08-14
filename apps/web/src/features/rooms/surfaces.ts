import type { RoomStage } from "@meld/contracts";
import { STAGE_ORDER } from "./stage-readiness";

export type RoomSurface =
  | "conversation"
  | "user-flows"
  | "prd"
  | "decisions"
  | "prototype"
  | "overview";

export type RoomSurfaceState = {
  hasUserFlow: boolean;
  hasPrd: boolean;
  hasPrdTask: boolean;
  hasBuiltDesignScreen: boolean;
  decisionCount: number;
  // The Prototype surface must be reachable *before* the first screen is
  // built -- that is where the chat-to-screen composer lives -- so it also
  // opens once the Room has moved into (or past) the Design stage, mirroring
  // "Canvas appears when hasUserFlow || hasDesignScreen || stage >= design".
  stage: RoomStage;
};

const DESIGN_STAGE_INDEX = STAGE_ORDER.indexOf("design");

export function getRoomSurfaces(state: RoomSurfaceState): RoomSurface[] {
  const artifacts: RoomSurface[] = [];
  if (state.hasUserFlow) artifacts.push("user-flows");
  if (state.hasPrd || state.hasPrdTask) artifacts.push("prd");
  if (state.decisionCount > 0) artifacts.push("decisions");
  if (
    state.hasBuiltDesignScreen ||
    STAGE_ORDER.indexOf(state.stage) >= DESIGN_STAGE_INDEX
  ) {
    artifacts.push("prototype");
  }

  return [
    "conversation",
    ...artifacts,
    ...(artifacts.length >= 2 ? (["overview"] as const) : []),
  ];
}

export function resolveRoomSurface(
  requested: unknown,
  availableSurfaces: readonly RoomSurface[],
): { activeSurface: RoomSurface; shouldReplaceUrl: boolean } {
  if (requested === undefined) {
    return { activeSurface: "conversation", shouldReplaceUrl: false };
  }
  if (
    typeof requested === "string" &&
    availableSurfaces.some((surface) => surface === requested)
  ) {
    return {
      activeSurface: requested as RoomSurface,
      shouldReplaceUrl: false,
    };
  }
  return { activeSurface: "conversation", shouldReplaceUrl: true };
}
