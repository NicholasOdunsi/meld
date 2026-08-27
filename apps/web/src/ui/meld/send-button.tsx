import { PixelArrowUp } from "@/ui/pixel-icons";
import styles from "./send-button.module.css";

export type MeldSendButtonProps = {
  /** Accessible name. The glyph carries no text. */
  label?: string;
  isDisabled?: boolean;
  onSend: () => void;
};

/**
 * The Meld send control: a filled, pixel-cornered block with a forward arrow.
 *
 * The same control the workspace console uses, so sending reads identically
 * wherever it happens. Deliberately not a circular disc -- that is Astryx's
 * `ChatSendButton` default, and a disc is the one shape this brand does not
 * use for a filled action.
 */
export function MeldSendButton({
  label = "Send",
  isDisabled = false,
  onSend,
}: MeldSendButtonProps) {
  return (
    <button
      type="button"
      className={styles.send}
      aria-label={label}
      disabled={isDisabled}
      onClick={onSend}
    >
      <PixelArrowUp aria-hidden="true" />
    </button>
  );
}
