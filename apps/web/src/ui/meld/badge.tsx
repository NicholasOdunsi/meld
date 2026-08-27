import styles from "./badge.module.css";

export type MeldBadgeTone =
  | "sky"
  | "pink"
  | "green"
  | "yellow"
  | "red"
  | "burgundy"
  | "neutral";

export type MeldBadgeProps = {
  label: string;
  tone?: MeldBadgeTone;
};

/** Role and status chip. */
export function MeldBadge({ label, tone = "neutral" }: MeldBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`} data-tone={tone}>
      {label}
    </span>
  );
}
