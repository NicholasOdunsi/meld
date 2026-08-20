import type { ReactNode } from "react";
import styles from "./plane.module.css";

export type MeldPlaneProps = {
  /** The panes placed on the 2x2 grid. `MeldPane` positions itself by grid line. */
  children: ReactNode;
  /** Floats at the plane's top-left. A slot -- the plane does not know what a toolbar is. */
  toolbar?: ReactNode;
  /** Pinned to the plane's bottom, overlaying the grid rather than reflowing it. */
  dock?: ReactNode;
  /** Visually hidden polite announcement for drag/drop placement. */
  liveRegion?: ReactNode;
};

/**
 * The Room's work surface: a dot field on the 24px grid holding a 2x2 pane
 * grid, with the toolbar floating at its top-left and the dock pinned to its
 * bottom.
 *
 * Both are slots. The plane does not know what a toolbar or a dock is, which
 * is what lets the generated Overview tab render a dock without a toolbar.
 */
export function MeldPlane({ children, toolbar, dock, liveRegion }: MeldPlaneProps) {
  return (
    <div className={styles.plane}>
      <div
        className={styles.grid}
        data-pane-grid="true"
        data-testid="plane-grid"
      >
        {children}
      </div>
      {toolbar ? <div className={styles.toolbar}>{toolbar}</div> : null}
      {dock ? <div className={styles.dock}>{dock}</div> : null}
      {liveRegion ? (
        <div className={styles.liveRegion} role="status" aria-live="polite">
          {liveRegion}
        </div>
      ) : null}
    </div>
  );
}
