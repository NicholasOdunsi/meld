"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { PixelChevronDown, PixelChevronUp } from "@/ui/pixel-icons";
import styles from "./dock.module.css";

export type MeldDockProps = {
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  composer: ReactNode;
  children: ReactNode;
};

/**
 * The Room-wide conversation band. Its composer stays available at the
 * bottom of the plane; the transcript appears above it without taking a pane
 * slot or changing the pane grid's size.
 *
 * Expansion owns two small pieces of keyboard behaviour. The first focusable
 * control in the composer receives focus when the transcript opens, so a
 * teammate can start typing immediately. Escape closes the band and returns
 * focus to its disclosure control. The caller still owns the expanded state.
 */
export function MeldDock({
  isExpanded,
  onExpandedChange,
  composer,
  children,
}: MeldDockProps) {
  const composerLineRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const conversationId = useId();

  useEffect(() => {
    if (!isExpanded) return;

    const firstFocusable = composerLineRef.current?.querySelector<HTMLElement>(
      "input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [contenteditable=\"true\"], button:not(:disabled), [tabindex]:not([tabindex=\"-1\"])",
    );

    firstFocusable?.focus();
  }, [isExpanded]);

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
      className={styles.frame}
      data-expanded={isExpanded ? "true" : "false"}
      data-testid="dock"
      aria-label="Room conversation"
    >
      <div className={styles.surface}>
        {isExpanded ? (
          <div
            id={conversationId}
            className={styles.body}
            data-testid="dock-body"
          >
            {children}
          </div>
        ) : null}
        <div className={styles.composerLine} ref={composerLineRef}>
          <div className={styles.composer}>{composer}</div>
          <button
            ref={toggleRef}
            type="button"
            className={styles.toggle}
            aria-label={isExpanded ? "Hide conversation" : "Show conversation"}
            aria-expanded={isExpanded}
            aria-controls={isExpanded ? conversationId : undefined}
            onClick={() => onExpandedChange(!isExpanded)}
          >
            {isExpanded ? (
              <PixelChevronDown pack="basic" size="sm" aria-hidden="true" />
            ) : (
              <PixelChevronUp pack="basic" size="sm" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
