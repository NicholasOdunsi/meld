"use client";

import { createContext, useContext } from "react";
import type { CanvasScreenSelection } from "@/features/canvas/use-canvas-selection";

export type RoomComposerPrdSelection = {
  label: string;
  quotedText: string;
};

export type RoomComposerContextValue = {
  prdSelection: RoomComposerPrdSelection | null;
  addPrdSelection: (selection: RoomComposerPrdSelection) => void;
  clearPrdSelection: () => void;
  /**
   * Screens currently selected on a Canvas pane, carried here for the one
   * composer the Room now has.
   *
   * The Canvas used to own a composer of its own, which read this selection
   * directly and used it to target an existing screen. With that composer gone
   * the selection had nowhere to go, so every request became a brand-new
   * screen and an existing one could never be edited. This rides the same
   * context that already carries a PRD text selection, for the same reason:
   * the surface holding the selection and the composer acting on it are
   * different panes.
   *
   * Empty means nothing is selected -- a new screen -- which is exactly what
   * the Canvas composer did with an empty selection.
   */
  canvasSelection: CanvasScreenSelection[];
  setCanvasSelection: (selection: CanvasScreenSelection[]) => void;
  /**
   * Names for the selected screens, keyed by id. A selection carries only ids,
   * and "screen-a" tells nobody what they are about to edit -- the Canvas
   * publishes these alongside so the composer can show real names.
   */
  canvasScreenNames: Map<string, string>;
  setCanvasScreenNames: (names: Map<string, string>) => void;
};

const RoomComposerContext = createContext<RoomComposerContextValue | null>(
  null,
);

export const RoomComposerProvider = RoomComposerContext.Provider;

export function useRoomComposerContext(): RoomComposerContextValue | null {
  return useContext(RoomComposerContext);
}
