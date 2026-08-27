import type { ReactNode } from "react";
import styles from "./field-frame.module.css";

export type MeldFieldFrameProps = {
  children: ReactNode;
  isIntegrated?: boolean;
};

/**
 * The Meld field edge, wrapped around something that is not a `MeldTextInput`.
 *
 * `MeldTextInput` and `MeldButton` build this edge into themselves. A control
 * composed from an Astryx component cannot -- it owns its own markup -- so it
 * wears the edge from the outside instead, and this keeps the two identical
 * rather than approximated. Give the wrapped control a transparent background
 * and no border of its own, or you get two edges.
 *
 * Focus inside recolours the edge (`:focus-within`) rather than adding a ring
 * around it, matching `MeldTextInput`.
 */
export function MeldFieldFrame({
  children,
  isIntegrated = false,
}: MeldFieldFrameProps) {
  return (
    <div className={styles.frame} data-integrated={isIntegrated || undefined}>
      <div className={styles.surface}>{children}</div>
    </div>
  );
}
