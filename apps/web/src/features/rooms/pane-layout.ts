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
  return panes.length < MAX_PANES && !panes.includes(tool);
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
