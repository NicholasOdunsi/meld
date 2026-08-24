"use client";

import { createContext, useContext } from "react";

export type RoomDockState = {
  /** Whether the transcript is showing above the composer. */
  isExpanded: boolean;
  /** Called by the composer when reaching for it should open the transcript. */
  onExpandedChange: (isExpanded: boolean) => void;
  /**
   * How much room the conversation has.
   *
   * - `dock`: a capped panel floating over the plane, above the composer.
   * - `page`: the conversation IS the tab. Fills the plane, always open, and
   *   paints no panel of its own -- there is nothing for it to float above.
   */
  variant: "dock" | "page";
};

const RoomDockContext = createContext<RoomDockState | null>(null);

export const RoomDockProvider = RoomDockContext.Provider;

/**
 * The Room dock's state, or `null` when the conversation is rendered outside
 * a dock (its own page, a test, a story).
 *
 * This exists because `Conversation` reaches `RoomPlane` as an already-built
 * `ReactNode` -- the Room page is a server component and constructs it there,
 * so `RoomPlane` cannot pass it props. Context is the only channel between
 * the two, and `Conversation` needs the dock's state for one reason: it owns
 * the real composer (all the draft, mention, attachment and routing state
 * lives in it), so it -- not the dock -- has to decide whether to render the
 * transcript above that composer.
 *
 * The alternative was the dock rendering a composer of its own, which is
 * what it used to do: a second, dumber text field stacked on top of the real
 * one. Two composers, one of which could not send.
 */
export function useRoomDock(): RoomDockState | null {
  return useContext(RoomDockContext);
}
