import styles from "./column-heading.module.css";

export type MeldColumnHeadingProps = {
  /** Printed heading, e.g. "PROJECTS". */
  label: string;
  /** Shown right-aligned on the same line. */
  count: number;
};

/**
 * A column's label and its count on one line, count pushed to the trailing
 * edge. Both set in Pixelify Sans at the smallest size -- metadata, not a
 * title.
 */
export function MeldColumnHeading({ label, count }: MeldColumnHeadingProps) {
  return (
    <div className={styles.heading}>
      <span className={styles.label}>{label}</span>
      <span className={styles.count}>{count}</span>
    </div>
  );
}
