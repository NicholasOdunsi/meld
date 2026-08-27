import type { ReactNode } from "react";
import styles from "./ticket.module.css";

export type MeldTicketProps = {
  /** Printed heading, e.g. "PENDING". */
  title: string;
  /** Shown top-right, zero-padded to two digits. */
  count: number;
  /** The printed line under the heading. */
  subtitle: string;
  /** Sits above the barcode -- the on-shift sprites. */
  footer?: ReactNode;
  children: ReactNode;
};

// Eleven bars of alternating height. Decorative: a receipt that stops dead
// above the tear reads as an unfinished panel rather than a printed slip.
const BARCODE = [100, 70, 100, 55, 100, 80, 100, 60, 100, 75, 100];

function printedCount(count: number): string {
  if (count > 99) return "99+";
  return String(count).padStart(2, "0");
}

/**
 * The dark paper the pending queue prints onto. Scalloped top and bottom,
 * dashed rules, barcode foot. Deliberately not `clip-path`-cornered: the
 * clip would slice the tear strips off.
 */
export function MeldTicket({
  title,
  count,
  subtitle,
  footer,
  children,
}: MeldTicketProps) {
  return (
    <div className={styles.ticket} data-testid="deck-ticket">
      <div className={`${styles.tear} ${styles.tearTop}`} aria-hidden />
      <div className={styles.head}>
        <span className={styles.title}>{title}</span>
        <span className={styles.count}>{printedCount(count)}</span>
      </div>
      <div className={styles.subtitle}>{subtitle}</div>
      <div className={styles.rule} aria-hidden />
      <div className={styles.body}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
      <div className={styles.barcode} aria-hidden>
        {BARCODE.map((height, index) => (
          <i key={index} style={{ height: `${height}%` }} />
        ))}
      </div>
      <div className={`${styles.tear} ${styles.tearBottom}`} aria-hidden />
    </div>
  );
}
