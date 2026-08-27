import styles from "./peek-card.module.css";

export type MeldPeekShape = "doc" | "screens" | "brief";

export type MeldTileColor =
  | "teal"
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "yellow"
  | "orange"
  | "cyan"
  | "green"
  | "gray";

export type MeldPeekCardProps = {
  shape: MeldPeekShape;
  color: MeldTileColor;
};

/**
 * The top of the project's most recent thing, poking out from behind the
 * tile. Decorative on purpose: it is a shape cue, not a readable preview, so
 * it renders rule lines rather than real text.
 */
export function MeldPeekCard({ shape, color }: MeldPeekCardProps) {
  return (
    <div
      className={styles.card}
      data-testid="peek-card"
      data-shape={shape}
      data-color={color}
      aria-hidden="true"
    >
      <div className={styles.strip} />
      {shape === "screens" ? (
        <div className={styles.screens}>
          <i />
          <i />
          <i />
        </div>
      ) : (
        <div className={styles.lines}>
          <i />
          <i />
          <i />
        </div>
      )}
    </div>
  );
}
