import type { SelectionSummary } from "../chrome/selection";
import type { PillItem } from "../chrome/screen-pill";
import { screenPillItems } from "./live-actions";
import { showScreenPill } from "./selection-rules";
import type { LiveState } from "./live-state";

export type Bounds = { x: number; y: number; width: number; height: number };
// `testId` is "selection-pill" on the PRIMARY pill only: the awake screen's when it has one, else the
// single pill that is visible. A second pill (a selected sleeping screen, or a shape, shown next to
// the awake one) is "selection-pill-extra", so a test or script never matches two elements.
// `label` names each group for assistive tech.
export type PillSpec = { key: string; bounds: Bounds; items: PillItem[]; label: string; testId: string };
export const PRIMARY_PILL_TEST_ID = "selection-pill";
export const EXTRA_PILL_TEST_ID = "selection-pill-extra";

// Which pills the board shows, and where. The awake screen the user may edit always has its own pill
// under its frame, selected or not; a selected screen without one gets Open live + Code (or just
// Code when it is awake but read-only); drawn shapes and text keep only the host's actions.
export function pillSpecs(input: {
  phase: LiveState["phase"];
  access: "edit" | "view";
  hasDraft: boolean;
  editable: boolean;
  // The awake screen's frame on the board, when it is on the board.
  liveFrame: { id: string; bounds: Bounds } | null;
  selection: SelectionSummary | null;
  edit: { pressed: boolean; onToggle: () => void };
  history: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void } | null;
  onOpenLive: (screenId: string, frameId: string) => void;
  onCode: (screenId: string, frameId: string) => void;
  hostScreenItems?: readonly PillItem[];
  hostShapeItems?: readonly PillItem[];
  awakeScreenId: string | null;
}): PillSpec[] {
  const specs: PillSpec[] = [];
  const { selection, liveFrame } = input;
  const awakeShown = !!liveFrame && input.awakeScreenId !== null && showScreenPill(input);
  const selectedIsLive = !!selection && selection.kind === "screen" && !!liveFrame && selection.ids[0] === liveFrame.id && input.phase !== "asleep";
  if (awakeShown && liveFrame && input.awakeScreenId) {
    const screenId = input.awakeScreenId;
    specs.push({
      key: `live:${liveFrame.id}`,
      label: "Screen actions", testId: PRIMARY_PILL_TEST_ID,
      bounds: liveFrame.bounds,
      items: [
        ...screenPillItems({ awake: true, edit: input.edit, history: input.history ?? undefined, onOpenLive: () => input.onOpenLive(screenId, liveFrame.id), onCode: () => input.onCode(screenId, liveFrame.id) }),
        ...(selectedIsLive ? input.hostScreenItems ?? [] : []),
      ],
    });
  }
  if (selection?.kind === "screen" && selection.screenId && !(awakeShown && selectedIsLive)) {
    const screenId = selection.screenId, frameId = selection.ids[0];
    specs.push({
      key: `selected:${frameId}`,
      label: selectedIsLive ? "Screen actions" : "Selected screen actions", testId: PRIMARY_PILL_TEST_ID,
      bounds: selection.bounds,
      items: [
        ...screenPillItems({ awake: selectedIsLive, onOpenLive: () => input.onOpenLive(screenId, frameId), onCode: () => input.onCode(screenId, frameId) }),
        ...(input.hostScreenItems ?? []),
      ],
    });
  } else if (selection && selection.kind !== "screen" && input.hostShapeItems?.length) {
    specs.push({ key: "shape", label: "Selection actions", testId: PRIMARY_PILL_TEST_ID, bounds: selection.bounds, items: [...input.hostShapeItems] });
  }
  // Only the first (primary) pill keeps the main test id.
  return specs.map((spec, index) => index === 0 ? spec : { ...spec, testId: EXTRA_PILL_TEST_ID });
}
