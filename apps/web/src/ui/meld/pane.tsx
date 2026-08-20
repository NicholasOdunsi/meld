import { useState } from "react";
import type { DragEventHandler, ReactNode } from "react";
import type { PaneRegion } from "@/features/rooms/pane-layout";
import { PixelChevronRight, PixelMove, PixelX } from "@/ui/pixel-icons";
import styles from "./pane.module.css";

/**
 * Re-exported so callers reach the geometry type through the primitive
 * rather than importing `features/rooms/pane-layout` directly. This is the
 * one deliberate, type-only ui-to-features import in this directory -- no
 * runtime edge, and the region shape lives with the layout logic that
 * derives it, not with the pane that merely renders it.
 */
export type MeldPaneRegion = PaneRegion;

export type MeldPaneProps = {
  /** The tool's name. Doubles as the pane's accessible name and the two
   * controls' accessible names ("Close {title}", "Open {title} in a new tab"). */
  title: string;
  /** Grid lines on the plane's 2x2 grid. Applied directly as inline style --
   * geometry is data, not a class, since there are only four regions but
   * they vary per pane count. */
  region: MeldPaneRegion;
  /** Lights up the frame layer's edge in the accent colour. */
  isFocused?: boolean;
  /** Omits the close control for read-only participants. */
  isClosable?: boolean;
  onClose?: () => void;
  /** Omits the create-a-new-tab control for read-only participants. */
  isPopOutable?: boolean;
  onPopOut?: () => void;
  /** Makes the pane a drag source when supplied. */
  onDragStart?: DragEventHandler<HTMLElement>;
  /** Keyboard destinations for the same move operation offered by drag/drop. */
  moveOptions?: readonly MeldPaneMoveOption[];
  onMove?: (index: number) => void;
  children: ReactNode;
};

export type MeldPaneMoveOption = {
  index: number;
  label: string;
};

/**
 * One framed pane on the plane: a title bar naming the tool, a close
 * control, a pop-out-to-new-tab control, and a content slot. It positions
 * itself on the plane's grid by `region` -- it does not compute geometry.
 *
 * The visible edge is a frame layer, not a border (see `MeldTextInput`):
 * `clip-path` slices a border into a ring that stops dead at each corner
 * step, so the edge instead comes from a filled, clipped outer with one
 * step of padding, wrapping a clipped inner. Focus is shown by swapping
 * that outer's fill from the strong line colour to the accent, so the
 * pane's own edge lights up rather than adding a ring around it.
 */
export function MeldPane({
  title,
  region,
  isFocused = false,
  isClosable = true,
  isPopOutable = true,
  onClose,
  onPopOut,
  onDragStart,
  moveOptions = [],
  onMove,
  children,
}: MeldPaneProps) {
  const [isMoveMenuOpen, setIsMoveMenuOpen] = useState(false);
  const canMove = Boolean(onMove && moveOptions.length > 0);

  return (
    <section
      className={styles.frame}
      aria-label={title}
      draggable={Boolean(onDragStart)}
      onDragStart={onDragStart}
      data-focused={isFocused ? "true" : "false"}
      style={{
        gridColumnStart: region.columnStart,
        gridColumnEnd: region.columnEnd,
        gridRowStart: region.rowStart,
        gridRowEnd: region.rowEnd,
      }}
    >
      <div className={styles.pane}>
        <header className={styles.head}>
          <span className={styles.title}>{title}</span>
          <span className={styles.actions}>
            {canMove ? (
              <span className={styles.moveControl}>
                <button
                  type="button"
                  className={styles.action}
                  aria-label={`Move ${title}`}
                  aria-haspopup="menu"
                  aria-expanded={isMoveMenuOpen}
                  onClick={() => setIsMoveMenuOpen((open) => !open)}
                >
                  <PixelMove pack="basic" size="sm" aria-hidden="true" />
                </button>
                {isMoveMenuOpen ? (
                  <span className={styles.moveMenu} role="menu">
                    {moveOptions.map((option) => (
                      <button
                        key={option.index}
                        type="button"
                        role="menuitem"
                        className={styles.moveOption}
                        onClick={() => {
                          onMove?.(option.index);
                          setIsMoveMenuOpen(false);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </span>
                ) : null}
              </span>
            ) : null}
            {isPopOutable ? (
              <button
                type="button"
                className={styles.action}
                onClick={onPopOut}
                aria-label={`Open ${title} in a new tab`}
              >
                <PixelChevronRight pack="basic" size="sm" aria-hidden="true" />
              </button>
            ) : null}
            {isClosable ? (
              <button
                type="button"
                className={styles.action}
                onClick={onClose}
                aria-label={`Close ${title}`}
              >
                <PixelX pack="basic" size="sm" aria-hidden="true" />
              </button>
            ) : null}
          </span>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </section>
  );
}
