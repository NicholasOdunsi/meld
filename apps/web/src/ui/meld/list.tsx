import type { ReactNode } from "react";
import styles from "./list.module.css";

export type MeldListProps = { children: ReactNode };

/** Divider-separated rows. */
export function MeldList({ children }: MeldListProps) {
  return <ul className={styles.list}>{children}</ul>;
}

export type MeldListItemProps = {
  label: string;
  /** Leading slot — typically an avatar or icon. */
  start?: ReactNode;
  /** Trailing slot — typically a badge or action. */
  end?: ReactNode;
};

export function MeldListItem({ label, start, end }: MeldListItemProps) {
  return (
    <li className={styles.item}>
      {start}
      <span className={styles.label}>{label}</span>
      {end}
    </li>
  );
}
