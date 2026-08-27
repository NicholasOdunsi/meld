import type { ReactNode } from "react";
import styles from "./auth-shell.module.css";
import { MeldMark } from "./meld-mark";
import { MeldPixelField } from "./pixel-field";

export type MeldAuthShellProps = {
  /** The screen's h1. */
  title: string;
  /** Sits under the title in the pixel voice. Accepts a node for live regions. */
  subtitle?: ReactNode;
  /** Replaces the Meld mark above the title -- e.g. the setup mascot. */
  crest?: ReactNode;
  /** Feedback rendered between the header and the body. */
  banner?: ReactNode;
  /** `wide` suits steps carrying a control row or a list, e.g. invite team. */
  width?: "default" | "wide";
  children?: ReactNode;
};

/**
 * The centred single-column screen: sign-in and every onboarding step.
 *
 * Owns the mark, the heading pair, and the pixel field — so every screen built
 * on it gets the footer by construction rather than by remembering to add it.
 * Deliberately built from raw elements rather than Astryx layout components;
 * that's the point of a primitive, and it drops five Astryx imports per screen.
 */
export function MeldAuthShell({
  title,
  subtitle,
  crest,
  banner,
  width = "default",
  children,
}: MeldAuthShellProps) {
  return (
    <div className={styles.shell}>
      <div
        className={[styles.column, width === "wide" ? styles.wide : null]
          .filter(Boolean)
          .join(" ")}
      >
        <div className={styles.header}>
          {crest ?? <MeldMark />}
          <div className={styles.headings}>
            <h1 className={styles.title}>{title}</h1>
            {typeof subtitle === "string" ? (
              <p className={styles.subtitle}>{subtitle}</p>
            ) : (
              subtitle
            )}
          </div>
        </div>
        {banner}
        {children}
      </div>
      <MeldPixelField />
    </div>
  );
}
