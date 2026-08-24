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
  children,
}: MeldDockProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const conversationId = useId();

  useEffect(() => {
    if (!isExpanded) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;

      event.preventDefault();
      onExpandedChange(false);
      toggleRef.current?.focus();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isExpanded, onExpandedChange]);

  return (
    <section
      className={styles.dock}
      data-expanded={isExpanded ? "true" : "false"}
      data-testid="dock"
      aria-label="Room conversation"
    >
      {/* Only offered once there is a transcript to hide. Collapsed, the
       * composer is the whole dock and there is nothing to disclose -- a
       * permanent chevron next to it would be a control that does nothing. */}
      {isExpanded ? (
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
      <div className={styles.surfaceFrame}>
        <div id={conversationId} className={styles.body} ref={bodyRef}>
          {children}
        </div>
      </div>
    </section>
  );
}
