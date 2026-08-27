import type { ReactNode } from "react";
import { MeldKindChip, type MeldPendingKind } from "./kind-chip";
import styles from "./ticket-row.module.css";

export type MeldTicketRowProps = {
  kind: MeldPendingKind;
  /** Where it came from, e.g. "CHECKOUT · GUEST FLOW". */
  source: string;
  /** How long it has been waiting, e.g. "2d". */
  age: string;
  /** The ask, in plain language. Body copy -- Archivo, not Pixelify. */
  ask: string;
  /** Action links. The deck navigates; it never writes. */
  children?: ReactNode;
};

export function MeldTicketRow({
  kind,
  source,
  age,
  ask,
  children,
}: MeldTicketRowProps) {
  return (
    <div className={styles.row} data-kind={kind}>
      <div className={styles.meta}>
        <MeldKindChip kind={kind} />
        <span className={styles.source}>{source}</span>
        <span className={styles.age}>{age}</span>
      </div>
      <p className={styles.ask}>{ask}</p>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </div>
  );
}
