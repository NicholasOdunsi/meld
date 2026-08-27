import styles from "./keycap.module.css";

export type MeldKeycapProps = {
  /** The key combo, e.g. "⌘K". Printed exactly as given. */
  children: string;
};

/**
 * A single keyboard shortcut, printed like a physical keycap. Pixelify Sans
 * keeps it in the metadata voice next to the sentence-case label it
 * describes -- see `ShortcutLine`.
 */
export function MeldKeycap({ children }: MeldKeycapProps) {
  return <span className={styles.keycap}>{children}</span>;
}
