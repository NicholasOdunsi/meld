/**
 * Pane geometry, derived rather than stored.
 *
 * A tab persists an *ordered list of tools* and nothing else -- no
 * coordinates, no sizes. Geometry falls out of the list's length and each
 * tool's index, which is why closing a pane reflows the rest with no
 * bookkeeping and why a layout survives any viewport width.
 */

export type PaneTool = "canvas" | "prototype" | "prd";

/** CSS grid lines on the plane's 2x2 grid. `MeldPane` applies these directly. */
export type PaneRegion = {
  columnStart: 1 | 2;
  columnEnd: 2 | 3;
  rowStart: 1 | 2;
  rowEnd: 2 | 3;
};

export type PaneLayout = PaneTool[];

/** Four is the most a tab holds. Beyond it, panes stop being readable. */
export const MAX_PANES = 4;

/**
 * A tool's smallest tolerable region, in the same vocabulary as the layout
 * shapes below: "half" is one of two side-by-side full-height panes (e.g.
 * `regionsFor(2)`'s panes, or the tall left pane in `regionsFor(3)`); a tool
 * with no entry here tolerates a quarter (a `regionsFor(3)` right-side pane
 * or any `regionsFor(4)` pane).
 *
 * Set from Task 6's width probe: the tldraw-backed canvas tool showed no
 * legible frame content at all at a quarter (420x260 CSS px at the 1060px
 * reference width) and only became legible once it had roughly half the
 * plane. See docs/superpowers/specs/2026-08-20-room-freeform-canvas-design.md,
 * "Width probe" under Risks, for the full finding. The prototype viewer is
 * not listed here -- it is a bare iframe with no chrome of its own, and the
 * probe found it legible down to a quarter.
 */
const MINIMUM_REGION: Partial<Record<PaneTool, "half">> = {
  canvas: "half",
};

function needsAtLeastHalf(tool: PaneTool): boolean {
  return MINIMUM_REGION[tool] === "half";
}

const LAYOUTS: Record<number, PaneRegion[]> = {
  0: [],
  1: [{ columnStart: 1, columnEnd: 3, rowStart: 1, rowEnd: 3 }],
  2: [
    { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 3 },
    { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 3 },
  ],
  3: [
    { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 3 },
    { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 2 },
    { columnStart: 2, columnEnd: 3, rowStart: 2, rowEnd: 3 },
  ],
  4: [
    { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 2 },
    { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 2 },
    { columnStart: 1, columnEnd: 2, rowStart: 2, rowEnd: 3 },
    { columnStart: 2, columnEnd: 3, rowStart: 2, rowEnd: 3 },
  ],
};

export function regionsFor(count: number): PaneRegion[] {
  const layout = LAYOUTS[count];
  if (!layout) {
    throw new Error(`regionsFor: ${count} panes has no layout`);
  }
  return layout;
}

export function canPlace(panes: PaneLayout, tool: PaneTool): boolean {
  if (panes.length >= MAX_PANES) return false;
  if (panes.includes(tool)) return false;
  return !wouldQuarterAHalfMinimumTool(panes, tool);
}

/**
 * True when adding `tool` would grow the tab to three or more panes while a
 * half-minimum tool is in play -- either `tool` itself, or one already open.
 * `regionsFor` only ever gives a pane a full half at counts 0-2 (and, at
 * count 3, to whichever tool happens to land in the tall left slot); once a
 * third pane joins, `insertPaneAt`'s caller picks the index, so `canPlace`
 * has no way to promise a specific tool keeps that slot. Rather than gamble
 * on index, this refuses the growth outright wherever a half-minimum tool
 * is on either side of it -- newly placed or already resident.
 */
function wouldQuarterAHalfMinimumTool(panes: PaneLayout, tool: PaneTool): boolean {
  const nextCount = panes.length + 1;
  if (nextCount < 3) return false;
  return needsAtLeastHalf(tool) || panes.some(needsAtLeastHalf);
}

/**
 * A short, user-facing reason `tool` cannot be placed right now, or `null`
 * when it can. Layered on top of `canPlace` so a future toolbar can explain
 * a disabled action instead of just disabling it -- this task only wires the
 * rule and the string; no toolbar consumes it yet.
 */
export function placementRefusalReason(
  panes: PaneLayout,
  tool: PaneTool,
): string | null {
  if (panes.includes(tool)) {
    return `${tool} is already open in this tab.`;
  }
  if (panes.length >= MAX_PANES) {
    return "This tab already holds as many panes as it can.";
  }
  if (wouldQuarterAHalfMinimumTool(panes, tool)) {
    return "Canvas needs at least half the plane to stay usable, so this tab can't take a third pane while Canvas is open.";
  }
  return null;
}

export function insertPaneAt(
  panes: PaneLayout,
  tool: PaneTool,
  index: number,
): PaneLayout {
  if (!canPlace(panes, tool)) return [...panes];
  const at = Math.max(0, Math.min(index, panes.length));
  const next = [...panes];
  next.splice(at, 0, tool);
  return next;
}

export function movePane(
  panes: PaneLayout,
  from: number,
  to: number,
): PaneLayout {
  if (from === to) return [...panes];
  const next = [...panes];
  const [moved] = next.splice(from, 1);
  if (!moved) return [...panes];
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

export function removePane(panes: PaneLayout, tool: PaneTool): PaneLayout {
  return panes.filter((pane) => pane !== tool);
}
