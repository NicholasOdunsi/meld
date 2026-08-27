import styles from "./banner.module.css";
import { PixelCheckCircle, PixelX } from "@/ui/pixel-icons";

export type MeldBannerStatus = "success" | "error" | "info";

export type MeldBannerProps = {
  status: MeldBannerStatus;
  title: string;
  /** Secondary line under the title. */
  description?: string;
};

/**
 * Feedback banner.
 *
 * Errors announce assertively so a failed submit is read immediately; success
 * and info are polite so they don't interrupt whatever the user is doing.
 */
export function MeldBanner({ status, title, description }: MeldBannerProps) {
  const Icon = status === "error" ? PixelX : PixelCheckCircle;

  return (
    <div className={`${styles.frame} ${styles[status]}`} data-status={status}>
      <div
        className={styles.body}
        role={status === "error" ? "alert" : "status"}
        aria-live={status === "error" ? "assertive" : "polite"}
      >
        <Icon
          pack="filled"
          width={18}
          height={18}
          className={styles.icon}
          aria-hidden
        />
        <span className={styles.text}>
          <span className={styles.title}>{title}</span>
          {description ? (
            <span className={styles.description}>{description}</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
