import type { ReactNode } from "react";
import styles from "./deck-frame.module.css";

export type MeldDeckFrameProps = {
  children: ReactNode;
};

/**
 * The deck's plane: plain white. No border, no dot grid, no wash -- the list
 * on top is the only thing with any weight.
 *
 * Purely a container -- every region inside it positions itself against the
 * 24px grid.
 */
export function MeldDeckFrame({ children }: MeldDeckFrameProps) {
  return (
    <div className={styles.plane} data-testid="deck-frame">
      <div className={styles.content}>{children}</div>
    </div>
  );
}
