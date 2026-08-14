// Whether the Canvas should seed empty screens from the Define flow's action
// nodes. Mirrors shouldSeedJourneyFlow's guards, minus canvasIsEmpty: seeded
// screens are additive to a canvas that may already hold the flow diagram.
export function shouldSeedDesignScreens(input: {
  hasUnseededActionNodes: boolean;
  access: "edit" | "view";
  storeStatus: string;
  hasSeeded: boolean;
}): boolean {
  return (
    input.hasUnseededActionNodes &&
    input.access === "edit" &&
    input.storeStatus === "synced-remote" &&
    !input.hasSeeded
  );
}
