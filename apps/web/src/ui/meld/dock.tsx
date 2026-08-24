"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { PixelChevronDown, PixelExpand, PixelX } from "@/ui/pixel-icons";
import styles from "./dock.module.css";

// Matches anything in the room that owns its own Escape: the screen pill's
// `DropdownMenu`, a pane's "Move" menu, and any Astryx `Popover`/`Dialog`
// (all render one of these roles/attributes -- see their sources), the
// stage-coaching panel (`role="dialog"`, open by default on arrival -- the
// very first Escape in a room can hit this), the PRD text-selection composer
// (`prd-selection-composer.tsx`, no ARIA role of its own -- its
// `data-testid` is the only stable hook, the same convention
// `room-plane.tsx`'s `focusDockComposer` already relies on), and the
// document editor's formatting/context menu (`freeform-document-editor.tsx`,
// `data-document-format-menu`).
//
// None of these are reliably gated on "open" by presence alone. Astryx's
// `DropdownMenu`/`Popover` (built on `useLayer`'s native-`popover` wrapper)
// render their role-bearing node unconditionally -- `DropdownMenu.tsx`'s
// `role="menu"` div and `usePopover.tsx`'s `role="dialog"` wrapper are never
// gated on `isOpen` -- and hide by putting `display: none` on an *ancestor*
// (the `popover`-attributed container two levels up), not on the node
// carrying the role itself. The document editor's formatting/context menu is
// the opposite case: it stays permanently mounted and toggles its own
// `style.visibility` (Tiptap's `BubbleMenu`), never an ancestor's. Checking
// only the matched element's own computed style catches the second case and
// silently misses the first -- a closed `DropdownMenu` would read as open
// forever. Walking every ancestor's computed style catches both, and costs
// nothing extra for the components (the stage-coaching panel, the PRD
// selection composer) that are genuinely conditionally mounted, where the
// element itself already carries the answer.
const DISMISSIBLE_SURFACE_SELECTOR = [
  '[role="menu"]',
  '[role="listbox"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  '[data-document-format-menu="true"]',
  '[data-testid="prd-selection-composer"]',
].join(", ");

// `Element.checkVisibility()` and `getClientRects()` both fail to report
// this correctly under jsdom (verified) -- this walks the ancestor chain by
// hand instead, checking each node's own `display`/`visibility` rather than
// relying on either API.
function isVisuallyHidden(element: HTMLElement): boolean {
  let node: HTMLElement | null = element;
  while (node) {
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

// Whether Escape should be read as "close whatever is on top of the room"
// rather than "collapse the composer behind it". This is a DOM check, not an
// `event.defaultPrevented` check, on purpose: this component's own keydown
// listener attaches on mount, before any of these surfaces exist, so it is
// first in `document`'s listener order and runs before whatever opened later
// ever gets a chance to mark the event handled -- `stopPropagation` on a
// sibling listener of the same target does not suppress a listener that
// already ran.
function hasOpenDismissibleSurface(): boolean {
  if (typeof document === "undefined") return false;
  const candidates = document.querySelectorAll<HTMLElement>(
    DISMISSIBLE_SURFACE_SELECTOR,
  );
  for (const element of candidates) {
    if (!isVisuallyHidden(element)) return true;
  }
  return false;
}

export type MeldDockProps = {
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  /**
   * Opens the conversation on its own tab. Omit to hide the control -- a
   * caller with nowhere to put a tab should not offer the button.
   */
  onExpandToTab?: () => void;
  /**
   * A third, lower state than `isExpanded` -- not a rename of it. Collapsed,
   * the dock is a small pill and the conversation (composer and transcript
   * alike) is hidden with CSS, never unmounted: unmounting would destroy
   * draft text, mentions and staged attachments still sitting in the
   * composer.
   */
  isCollapsed: boolean;
  /** Called with `false` when the pill is clicked, asking to expand. */
  onCollapsedChange: (isCollapsed: boolean) => void;
  /**
   * Set while collapsing would hide unsent work -- a draft or a staged
   * attachment. The caller's `onCollapsedChange` already refuses the
   * collapse in this case; this only makes that refusal visible, marking
   * "Collapse conversation" `aria-disabled` and explaining why in its
   * `title` rather than leaving the control looking broken.
   */
  isCollapseDisabled?: boolean;
  /**
   * The pill's accessible name while collapsed. Resting state is exactly
   * "Ask anything" -- the dock addresses Product, Research, Design or a
   * teammate, so naming one on the pill would be wrong. Callers may prefix a
   * selection count, e.g. "2 screens selected · Ask anything".
   */
  collapsedLabel: string;
  /**
   * The conversation: its transcript AND its composer. Note there is no
   * `composer` slot on this component -- see the note below.
   */
  children: ReactNode;
};

/**
 * The Room's conversation, floating over the plane: a composer sitting on the
 * canvas, with the transcript appearing above it once there is one.
 *
 * This component owns **no composer of its own**, deliberately. It used to
 * take a `composer` slot, which the Room filled with a plain text input --
 * and because `Conversation` renders the real `RoomComposer` itself (all the
 * draft, mention, attachment, model and routing state lives in there), the
 * result was two composers stacked, only one of which could actually send.
 * The child renders one composer and this renders a frame around whatever it
 * gives back.
 *
 * Collapsed, the composer keeps its own field edge. Expanded, this component
 * supplies one shared surface around the transcript and composer.
 *
 * Escape closes the transcript first, same as always, and returns focus to
 * the disclosure control. With no transcript open -- the composer-only
 * state -- Escape instead collapses the dock to its pill, through the same
 * `onCollapsedChange` path the "Collapse conversation" control uses, so the
 * unsent-work guard applies to Escape too.
 */
export function MeldDock({
  isExpanded,
  onExpandedChange,
  onExpandToTab,
  isCollapsed,
  onCollapsedChange,
  isCollapseDisabled = false,
  collapsedLabel,
  children,
}: MeldDockProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const conversationId = useId();

  useEffect(() => {
    if (isCollapsed) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      if (isExpanded) {
        event.preventDefault();
        onExpandedChange(false);
        toggleRef.current?.focus();
        return;
      }

      // Something else on top of the room owns this Escape -- let it, rather
      // than hiding the composer out from under it. Not scoped to the
      // `isExpanded` branch above: that one only ever closes this
      // component's own transcript, which cannot itself be "under" another
      // surface the same way collapsing the whole composer can.
      if (hasOpenDismissibleSurface()) return;

      event.preventDefault();
      onCollapsedChange(true);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isExpanded, isCollapsed, onExpandedChange, onCollapsedChange]);

  // Collapsing removes the whole `.controls` span -- including whatever
  // inside it held focus (typically "Collapse conversation" itself) -- and
  // with nothing left to receive it, focus resets to `document.body`. A
  // keyboard user loses their place on the page. `wasCollapsedRef` tracks
  // the transition rather than firing on every render (which would steal
  // focus back to the pill on an unrelated re-render while already
  // collapsed), mirroring the Escape handler's own `toggleRef.current?.focus()`
  // one function up.
  const wasCollapsedRef = useRef(isCollapsed);
  useEffect(() => {
    if (isCollapsed && !wasCollapsedRef.current) {
      pillRef.current?.focus();
    }
    wasCollapsedRef.current = isCollapsed;
  }, [isCollapsed]);

  return (
    <section
      className={styles.dock}
      data-expanded={isExpanded ? "true" : "false"}
      data-collapsed={isCollapsed ? "true" : "false"}
      data-testid="dock"
      aria-label="Room conversation"
    >
      {/* The pill: page chrome, exactly one, no matter how many panes are
       * open. It replaces both the surface and its controls -- there is
       * nothing to disclose or promote to a tab while collapsed. A
       * disclosure control in everything but name, so it carries the same
       * `aria-expanded`/`aria-controls` pair as "Hide conversation" below. */}
      {isCollapsed ? (
        <button
          ref={pillRef}
          type="button"
          className={styles.pill}
          aria-expanded={false}
          aria-controls={conversationId}
          onClick={() => onCollapsedChange(false)}
        >
          {collapsedLabel}
        </button>
      ) : null}
      {!isCollapsed ? (
        <span className={styles.controls}>
          {/* Only offered once there is a transcript to hide -- collapsing
           * the whole dock is the separate "Collapse conversation" control
           * below, always present once the composer is showing. */}
          {isExpanded && onExpandToTab ? (
            <button
              type="button"
              className={styles.toggle}
              aria-label="Open conversation in a tab"
              onClick={onExpandToTab}
            >
              <PixelExpand pack="basic" aria-hidden="true" />
            </button>
          ) : null}
          {isExpanded ? (
            <button
              ref={toggleRef}
              type="button"
              className={styles.toggle}
              aria-label="Hide conversation"
              aria-expanded={isExpanded}
              aria-controls={conversationId}
              onClick={() => onExpandedChange(false)}
            >
              <PixelChevronDown pack="basic" aria-hidden="true" />
            </button>
          ) : null}
          {/* The sibling of the pill: collapses the dock back down. Reaching
           * the composer is a click or ⌘K away; this is the way back, so it
           * has to exist for as long as the pill's expand side does. */}
          <button
            type="button"
            className={styles.toggle}
            aria-label="Collapse conversation"
            aria-expanded={!isCollapsed}
            aria-controls={conversationId}
            aria-disabled={isCollapseDisabled || undefined}
            title={
              isCollapseDisabled
                ? "Finish or clear your message before collapsing"
                : undefined
            }
            onClick={() => onCollapsedChange(true)}
          >
            <PixelX pack="basic" aria-hidden="true" />
          </button>
        </span>
      ) : null}
      {/* Never a conditional render: unmounting would destroy the composer's
       * draft text, mentions and staged attachments. CSS hides it instead --
       * and stays the direct flex child of `.dock` it always was, so the
       * `min-block-size: 0` that stops the panel growing to fill the plane
       * still applies to it. */}
      <div hidden={isCollapsed} className={styles.surfaceFrame}>
        <div id={conversationId} className={styles.body} ref={bodyRef}>
          {children}
        </div>
      </div>
    </section>
  );
}
