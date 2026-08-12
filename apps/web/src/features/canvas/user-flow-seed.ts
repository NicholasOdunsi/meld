// Whether an empty User Flows canvas should be seeded from the PRD journey
// flow. Kept pure (no React/tldraw) so the conditions are unit-testable.
//
// Every guard matters:
//   - a seed flow must exist to draw;
//   - only an editor (edit access) may write to the shared canvas;
//   - `synced-remote` means the server's records have arrived, so an empty
//     canvas is genuinely empty rather than not-yet-synced (seeding on
//     `synced-local` could double-draw over remote content);
//   - only an empty canvas is seeded, so existing work is never clobbered;
//   - a one-shot guard keeps a re-render from drawing the flow twice.
export function shouldSeedJourneyFlow(input: {
  hasSeedFlow: boolean;
  access: "edit" | "view";
  storeStatus: string;
  canvasIsEmpty: boolean;
  hasSeeded: boolean;
}): boolean {
  return (
    input.hasSeedFlow &&
    input.access === "edit" &&
    input.storeStatus === "synced-remote" &&
    input.canvasIsEmpty &&
    !input.hasSeeded
  );
}
