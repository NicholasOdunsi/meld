import styles from "./kind-chip.module.css";

export type MeldPendingKind = "review" | "approve" | "failed" | "stale";

const LABELS: Record<MeldPendingKind, string> = {
  review: "REVIEW",
  approve: "APPROVE",
  failed: "FAILED",
  stale: "STALE",
};

export type MeldKindChipProps = {
  kind: MeldPendingKind;
};

/**
 * The stamped kind on a pending row. Pixelify Sans is correct here -- this is
 * metadata, not copy -- and the colour is doing the sorting, so the label
 * stays a single word.
 */
export function MeldKindChip({ kind }: MeldKindChipProps) {
  return (
    <span className={styles.chip} data-kind={kind}>
      {LABELS[kind]}
    </span>
  );
}
