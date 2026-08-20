import styles from "./watermark.module.css";

export type MeldWatermarkProps = {
  workspaceName: string;
};

/**
 * The wordmark ghosted through the middle of the deck. `aria-hidden` because
 * the workspace name is already announced by the top strip -- repeating it
 * would be noise, and the mark itself carries no information.
 */
export function MeldWatermark({ workspaceName }: MeldWatermarkProps) {
  return (
    <div className={styles.mark} data-testid="deck-watermark" aria-hidden="true">
      <div className={styles.word}>MELD</div>
      <div className={styles.sub}>{workspaceName}</div>
    </div>
  );
}
