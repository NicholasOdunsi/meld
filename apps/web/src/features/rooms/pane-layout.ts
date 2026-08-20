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
 * A tool's smallest tolerable region. "half" is a region spanning one full
 * axis and half the other -- one of two side-by-side full-height panes (as
 * in `regionsFor(2)`, or the tall left pane in `regionsFor(3)`) or, if the
 * plane is ever split horizontally instead, a full-width half-height pane.
 * A tool with no entry here tolerates a quarter (both `regionsFor(3)`
 * right-side panes, or any `regionsFor(4)` pane).
 *
 * Set from Task 6's width probe: the tldraw-backed canvas tool showed no
 * legible frame content at all at a quarter (420x260 CSS px at the 1060px
 * reference width) and only became legible once it had roughly half the
 * plane (measured at ~480x320 and comfortable by ~530x540). See
 * docs/superpowers/specs/2026-08-20-room-freeform-canvas-design.md,
 * "Width probe" under Risks, for the full finding. The prototype viewer is
 * not listed here -- it is a bare iframe with no chrome of its own, and the
 * probe found it legible down to a quarter.
 *
 * This is enforced against the *region a tool would actually occupy*
 * (`classifyRegion`, below), not against the tab's pane count: `regionsFor`
 * hands out a half at some indices even in a three-pane layout, so the
 * count alone doesn't say whether a given tool would land in one.
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

/**
 * A region's area class, read off its own grid span rather than the pane
 * count it came from. This is the vocabulary `MINIMUM_REGION` is written
 * against -- a "half" minimum means "not a quarter" here, wherever a
 * quarter happens to show up in `LAYOUTS`. If `regionsFor`'s shapes ever
 * change (a horizontal split, a different four-pane arrangement), this
 * still classifies correctly from the span alone; nothing above needs to
 * change in step for the minimum-region rule to keep holding.
 */
export type RegionClass = "full" | "half" | "quarter";

export function classifyRegion(region: PaneRegion): RegionClass {
  const columnSpan = region.columnEnd - region.columnStart;
  const rowSpan = region.rowEnd - region.rowStart;
  if (columnSpan === 2 && rowSpan === 2) return "full";
  if (columnSpan === 1 && rowSpan === 1) return "quarter";
  return "half";
}

function regionSatisfies(tool: PaneTool, region: PaneRegion): boolean {
  if (!needsAtLeastHalf(tool)) return true;
  return classifyRegion(region) !== "quarter";
}

/** True when every tool in `panes` fits the region its index implies. */
function layoutIsValid(panes: PaneLayout): boolean {
  const regions = regionsFor(panes.length);
  return panes.every((tool, index) => regionSatisfies(tool, regions[index]));
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

function withInsertedAt(
  panes: PaneLayout,
  tool: PaneTool,
  index: number,
): PaneLayout {
  const next = [...panes];
  next.splice(clampIndex(index, panes.length), 0, tool);
  return next;
}

/**
 * True when `tool` can be added *somewhere* in `panes` without breaking any
 * tool's minimum region -- including tools already open, which an insertion
 * can displace into a smaller slot even though it isn't the tool moving.
 * This only answers "does a legal index exist"; `insertPaneAt` still checks
 * the specific index it's given, since a legal index existing doesn't make
 * every index legal (canvas fits at index 0 of a three-pane tab, not at 1
 * or 2).
 */
export function canPlace(panes: PaneLayout, tool: PaneTool): boolean {
  if (panes.length >= MAX_PANES) return false;
  if (panes.includes(tool)) return false;
  for (let index = 0; index <= panes.length; index += 1) {
    if (layoutIsValid(withInsertedAt(panes, tool, index))) return true;
  }
  return false;
}

/**
 * A short, user-facing reason `tool` cannot go at `index` in `panes` right
 * now, or `null` when it can. Layered on top of the same checks
 * `insertPaneAt` runs, so a future toolbar or drop zone can explain a
 * disabled action instead of just disabling it -- this task only wires the
 * rule and the string; no toolbar consumes it yet.
 */
export function paneRefusalReason(
  panes: PaneLayout,
  tool: PaneTool,
  index: number,
): string | null {
  if (panes.includes(tool)) {
    return `${tool} is already open in this tab.`;
  }
  if (panes.length >= MAX_PANES) {
    return "This tab already holds as many panes as it can.";
  }
  if (!layoutIsValid(withInsertedAt(panes, tool, index))) {
    return "Canvas needs at least half the plane to stay usable, so it can't go there.";
  }
  return null;
}

export function insertPaneAt(
  panes: PaneLayout,
  tool: PaneTool,
  index: number,
): PaneLayout {
  if (panes.length >= MAX_PANES) return [...panes];
  if (panes.includes(tool)) return [...panes];
  const next = withInsertedAt(panes, tool, index);
  if (!layoutIsValid(next)) return [...panes];
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
  next.splice(clampIndex(to, next.length), 0, moved);
  if (!layoutIsValid(next)) return [...panes];
  return next;
}

export function removePane(panes: PaneLayout, tool: PaneTool): PaneLayout {
  return panes.filter((pane) => pane !== tool);
}
