import styles from "./code-block.module.css";

export type MeldCodeBlockProps = {
  code: string;
  /** Caption above the code, e.g. "Terminal". */
  title?: string;
  "data-testid"?: string;
};

/** A command to copy and run. */
export function MeldCodeBlock({
  code,
  title,
  "data-testid": testId,
}: MeldCodeBlockProps) {
  return (
    <div className={styles.frame} data-testid={testId}>
      {title ? <span className={styles.title}>{title}</span> : null}
      <pre className={styles.code}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
