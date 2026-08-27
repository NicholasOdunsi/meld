import type { FormHTMLAttributes } from "react";
import styles from "./form.module.css";

export type MeldFormProps = Omit<
  FormHTMLAttributes<HTMLFormElement>,
  "className"
>;

/**
 * A form with the system's vertical rhythm.
 *
 * Thin on purpose — it exists so screens stop reaching for Astryx's
 * `FormLayout` for what is one flex column.
 */
export function MeldForm(props: MeldFormProps) {
  return <form {...props} className={styles.form} />;
}
