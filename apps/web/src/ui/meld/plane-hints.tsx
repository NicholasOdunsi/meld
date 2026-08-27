import { MeldPointerHint } from "./pointer-hint";
import type { MeldToolbarCorner } from "./toolbar";
import styles from "./plane-hints.module.css";

export type MeldPlaneHintsProps = {
  /** Points at the toolbar. Omit to hide that hint (e.g. a view-only room). */
  toolbar?: string;
  /** Points at the composer. */
  composer?: string;
  /**
   * Which corner the toolbar is parked in. The arrow has to start beside the
   * panel it points at, so when the reader moves the toolbar this moves with
   * it -- otherwise the one instruction an empty room gives points at blank
   * field.
   */
  toolbarCorner?: MeldToolbarCorner;
};

/**
 * What an empty plane says for itself: two short annotations, each with a
 * pixelated curved arrow pointing at the control it describes.
 *
 * Anchored to the controls rather than centred as a block -- an arrow
 * pointing at the toolbar has to begin near the toolbar or it points at
 * nothing. That anchoring is why this is a component and not two loose
 * `MeldPointerHint`s: the offsets belong with the plane that owns the
 * toolbar and dock positions, not with each call site.
 *
 * Entirely decorative. The layer is `pointer-events: none` so it cannot
 * swallow a drag onto the drop zones underneath, which would break the very
 * gesture the first hint is teaching.
 */
export function MeldPlaneHints({
  toolbar,
  composer,
  toolbarCorner = "top-start",
}: MeldPlaneHintsProps) {
  if (!toolbar && !composer) return null;

  return (
    <div className={styles.hints} data-testid="plane-hints">
      {toolbar ? (
        <div className={styles.toolbar} data-corner={toolbarCorner}>
          <MeldPointerHint direction="left">{toolbar}</MeldPointerHint>
        </div>
      ) : null}
      {composer ? (
        <div className={styles.composer}>
          <MeldPointerHint direction="down">{composer}</MeldPointerHint>
        </div>
      ) : null}
    </div>
  );
}
