"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { PixelChevronDown, PixelExpand } from "@/ui/pixel-icons";
import styles from "./dock.module.css";

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
 * Escape collapses the dock and returns focus to the disclosure control.
 */
export function MeldDock({
  isExpanded,
  onExpandedChange,
  onExpandToTab,
  isCollapsed,
  onCollapsedChange,
  collapsedLabel,
  children,
}: MeldDockProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const conversationId = useId();

  useEffect(() => {
    if (!isExpanded || isCollapsed) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();
      onExpandedChange(false);
      toggleRef.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isExpanded, isCollapsed, onExpandedChange]);

  return (
    <section
      className={styles.dock}
      data-expanded={isExpanded ? "true" : "false"}
      data-testid="dock"
      aria-label="Room conversation"
    >
      {/* The pill: page chrome, exactly one, no matter how many panes are
       * open. It replaces both the surface and its controls -- there is
       * nothing to disclose or promote to a tab while collapsed. */}
      {isCollapsed ? (
        <button
          type="button"
          className={styles.pill}
          onClick={() => onCollapsedChange(false)}
        >
          {collapsedLabel}
        </button>
      ) : null}
      {/* Only offered once there is a transcript to hide. Collapsed, the
       * composer is the whole dock and there is nothing to disclose -- a
       * permanent chevron next to it would be a control that does nothing. */}
      {!isCollapsed && isExpanded ? (
        <span className={styles.controls}>
          {onExpandToTab ? (
            <button
              type="button"
              className={styles.toggle}
              aria-label="Open conversation in a tab"
              onClick={onExpandToTab}
            >
              <PixelExpand pack="basic" aria-hidden="true" />
            </button>
          ) : null}
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
        </span>
      ) : null}
      {/* Never a conditional render: unmounting would destroy the composer's
       * draft text, mentions and staged attachments. CSS hides it instead. */}
      <div hidden={isCollapsed}>
        <div className={styles.surfaceFrame}>
          <div id={conversationId} className={styles.body} ref={bodyRef}>
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
