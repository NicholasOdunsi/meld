import type { ReactNode } from "react";
import styles from "./deck-frame.module.css";

export type MeldDeckFrameProps = {
  children: ReactNode;
};

/**
 * The deck's plane: a dot field with a single hairline frame inset from the
 * viewport edge. Purely a container -- every region inside it positions
 * itself against the 24px grid the field draws.
 */
export function MeldDeckFrame({ children }: MeldDeckFrameProps) {
  return (
    <div className={styles.plane} data-testid="deck-frame">
      <div className={styles.field} aria-hidden />
      <div className={styles.frame} aria-hidden />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
