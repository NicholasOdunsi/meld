import type { ReactNode } from "react";
import type { PaneRegion } from "@/features/rooms/pane-layout";
import { PixelChevronRight, PixelX } from "@/ui/pixel-icons";
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
  onPopOut: () => void;
  children: ReactNode;
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
  onClose,
  onPopOut,
  children,
}: MeldPaneProps) {
  return (
    <section
      className={styles.frame}
      aria-label={title}
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
            <button
              type="button"
              className={styles.action}
              onClick={onPopOut}
              aria-label={`Open ${title} in a new tab`}
            >
              <PixelChevronRight pack="basic" size="sm" aria-hidden="true" />
            </button>
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
