import { PANE_TITLES } from "./components/pane-content";
import type { PaneLayout } from "./pane-layout";

/**
 * Names for tabs that have nothing in them yet, in birth order.
 *
 * A room fills up with tabs faster than anyone will name them, and five
 * things called "Untitled" are indistinguishable in a tab strip -- which is
 * the whole job a tab label has. A fixed, ordered set of real names means
 * every tab is nameable in conversation ("it's in Ubbe") from the moment it
 * exists, without anyone having to stop and name it.
 */
const RAGNARSSONS = ["Bjorn", "Ubbe", "Hvitserk", "Sigurd", "Ivar"] as const;

/**
 * What a tab is called when nobody has named it.
 *
 * Three cases, and the middle one is the point:
 *
 *   no panes      a Ragnarsson -- there is nothing to describe yet.
 *   one pane      that tool's name. A tab holding only a Canvas *is* the
 *                 canvas, and calling it anything else is a second name for
 *                 the same thing.
 *   two or more   back to a Ragnarsson. "Canvas" would now be a lie, and
 *                 "Canvas + Document" grows without bound and stops fitting.
 *
 * Display only. Nothing here is written to `room_tabs.name`, which stays
 * null until someone renames the tab by hand -- so an explicit name always
 * wins, and dragging a tool into a tab you named does not rename it back.
 *
 * Keyed on `position`, not on array index: positions are persisted and
 * unique, so a tab keeps its name when a tab *before* it closes. Indexing
 * would shuffle every later tab's name on every close.
 */
export function tabDisplayName(tab: {
  name: string | null;
  position: number;
  panes: PaneLayout;
}): string {
  if (tab.name) return tab.name;
  if (tab.panes.length === 1) return PANE_TITLES[tab.panes[0]!];
  return ragnarsson(tab.position);
}

function ragnarsson(position: number): string {
  const index = Math.abs(position) % RAGNARSSONS.length;
  return RAGNARSSONS[index]!;
}
