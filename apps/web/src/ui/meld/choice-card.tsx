import type { ReactNode } from "react";
import styles from "./choice-card.module.css";

/** Centred, wrapping row of choice cards. */
export function MeldChoiceGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export type MeldChoiceCardProps = {
  /** The accessible name. Say what picking it does, e.g. "Connect Codex". */
  label: string;
  /** Visible caption under the mark. */
  title: string;
  /** Logo or icon. */
  media?: ReactNode;
  /** Pixel-voice line under the title, e.g. "Starting…". */
  status?: string;
  isDisabled?: boolean;
  onClick?: () => void;
};

/**
 * A large pick-one target.
 *
 * A real `<button>` with an explicit `aria-label`, so the accessible name is
 * the action ("Connect Codex") rather than the concatenation of everything
 * inside it ("Codex Starting…").
 */
export function MeldChoiceCard({
  label,
  title,
  media,
  status,
  isDisabled = false,
  onClick,
}: MeldChoiceCardProps) {
  return (
    <button
      type="button"
      className={styles.card}
      aria-label={label}
      disabled={isDisabled}
      onClick={onClick}
    >
      <span className={styles.body}>
        {media}
        {title}
        {status ? <span className={styles.status}>{status}</span> : null}
      </span>
    </button>
  );
}
