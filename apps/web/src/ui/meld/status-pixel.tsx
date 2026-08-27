import styles from "./status-pixel.module.css";

export type MeldStatusTone =
  | "success"
  | "error"
  | "warning"
  | "accent"
  | "neutral";

export type MeldStatusPixelProps = {
  tone: MeldStatusTone;
  label: string;
  /** Pulse while the thing being reported is still moving. */
  isPulsing?: boolean;
};

/**
 * Status indicator with its label.
 *
 * The square is decorative -- the label beside it carries the meaning, so
 * announcing a colour would add nothing.
 */
export function MeldStatusPixel({
  tone,
  label,
  isPulsing = false,
}: MeldStatusPixelProps) {
  return (
    <span className={styles.row} data-tone={tone}>
      <span
        className={[
          styles.pixel,
          styles[tone],
          isPulsing ? styles.pulsing : null,
        ]
          .filter(Boolean)
          .join(" ")}
        aria-hidden
      />
      {label}
    </span>
  );
}
