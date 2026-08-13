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
};

export function getRoomSurfaces(state: RoomSurfaceState): RoomSurface[] {
  const artifacts: RoomSurface[] = [];
  if (state.hasUserFlow) artifacts.push("user-flows");
  if (state.hasPrd || state.hasPrdTask) artifacts.push("prd");
  if (state.decisionCount > 0) artifacts.push("decisions");
  if (state.hasBuiltDesignScreen) artifacts.push("prototype");

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
