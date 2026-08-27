import type { DragEvent } from "react";
import type { MeldPaneRegion } from "./pane";
import styles from "./drop-zone.module.css";

/**
 * A candidate region while a tool is being dragged.
 *
 * The label is the sentence the plane's aria-live region announces, so it is
 * written as one -- "Open PRD on the right half", not "right".
 */
export function MeldDropZone({
  region,
  label,
  isActive,
  onDragEnter,
  onDragOver,
  onDrop,
}: {
  region: MeldPaneRegion;
  label: string;
  isActive: boolean;
  onDragEnter?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: () => void;
}) {
  return (
    <div
      role="presentation"
      aria-label={label}
      data-testid="drop-zone"
      data-active={isActive ? "true" : "false"}
      className={styles.zone}
      style={{
        gridColumnStart: region.columnStart,
        gridColumnEnd: region.columnEnd,
        gridRowStart: region.rowStart,
        gridRowEnd: region.rowEnd,
      }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <span className={styles.surface} aria-hidden="true" />
    </div>
  );
}
