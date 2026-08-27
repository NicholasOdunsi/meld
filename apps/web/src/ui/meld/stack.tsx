import type { CSSProperties, ReactNode } from "react";
import styles from "./stack.module.css";

const GAPS = {
  2: "var(--meld-space-2)",
  3: "var(--meld-space-3)",
  4: "var(--meld-space-4)",
  5: "var(--meld-space-5)",
  6: "var(--meld-space-6)",
} as const;

export type MeldStackProps = {
  gap?: keyof typeof GAPS;
  /** Passthrough so a migrated block can keep the test id it already had. */
  "data-testid"?: string;
  children: ReactNode;
};

/** Vertical stack on the spacing scale. */
export function MeldStack({
  gap = 4,
  "data-testid": testId,
  children,
}: MeldStackProps) {
  return (
    <div
      className={styles.stack}
      data-testid={testId}
      style={{ "--meld-gap": GAPS[gap] } as CSSProperties}
    >
      {children}
    </div>
  );
}

export type MeldSectionProps = { title: string; children: ReactNode };

/** A titled block. The title is an `h2`. */
export function MeldSection({ title, children }: MeldSectionProps) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

/** A standalone section heading, for blocks that aren't a full `MeldSection`. */
export function MeldSectionHeading({ children }: { children: ReactNode }) {
  return <h3 className={styles.sectionTitle}>{children}</h3>;
}

/** Secondary copy in the pixel voice — empty states, hints. */
export function MeldNote({ children }: { children: ReactNode }) {
  return <p className={styles.note}>{children}</p>;
}

/** Secondary copy in the normal (non-pixel) voice, for sentences. */
export function MeldSupportingText({ children }: { children: ReactNode }) {
  return <p className={styles.supporting}>{children}</p>;
}

/** Numbered steps. Pixel numerals, Archivo text. */
export function MeldSteps({ children }: { children: ReactNode }) {
  return <ol className={styles.steps}>{children}</ol>;
}

export function MeldStep({ children }: { children: ReactNode }) {
  return <li className={styles.step}>{children}</li>;
}

/** An inline "…in progress" line with an animated pixel ellipsis. */
export function MeldLoadingNote({ children }: { children: ReactNode }) {
  return (
    <p className={styles.loading} role="status">
      {children}
    </p>
  );
}

/** Centred button row. */
export function MeldCenteredActions({ children }: { children: ReactNode }) {
  return <div className={styles.centeredActions}>{children}</div>;
}

/** Left-aligned button row. */
export function MeldStartActions({ children }: { children: ReactNode }) {
  return <div className={styles.startActions}>{children}</div>;
}

/** A small field-style label above a value. */
export function MeldLabel({ children }: { children: ReactNode }) {
  return <span className={styles.label}>{children}</span>;
}

/** A pairing/verification code, shown large in the pixel voice. */
export function MeldCode({
  children,
  "data-testid": testId,
}: {
  children: ReactNode;
  "data-testid"?: string;
}) {
  return (
    <p className={styles.pairingCode} data-testid={testId}>
      {children}
    </p>
  );
}

/** Right-aligned button row. */
export function MeldActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}

/** Controls on one line: the first child flexes, the rest keep their width. */
export function MeldControlRow({ children }: { children: ReactNode }) {
  return <div className={styles.controlRow}>{children}</div>;
}

/** Raised white panel with the pixel corner. */
export function MeldCard({ children }: { children: ReactNode }) {
  return <div className={styles.card}>{children}</div>;
}
