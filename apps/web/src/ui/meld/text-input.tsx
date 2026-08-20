import { useId } from "react";
import type { InputHTMLAttributes } from "react";
import styles from "./text-input.module.css";

export type MeldTextInputSize = "md" | "lg";

export type MeldTextInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className" | "disabled" | "size" | "id"
> & {
  /** Always visible -- this system has no placeholder-as-label pattern. */
  label: string;
  /** Renders in the error style and wires up `aria-invalid`/`aria-describedby`. */
  errorMessage?: string;
  /** Secondary help text. Ignored while `errorMessage` is set. */
  hint?: string;
  inputSize?: MeldTextInputSize;
  isDisabled?: boolean;
  /** Keeps the label for assistive tech but takes it off screen. */
  hideLabel?: boolean;
};

/**
 * The Meld text input.
 *
 * Shares Button's notch so controls read as one family. The focused state
 * recolours the notch rather than adding an outline ring, keeping a single
 * shape on screen. See `COMPONENTS.md` for the full contract.
 */
export function MeldTextInput({
  label,
  errorMessage,
  hint,
  inputSize = "md",
  isDisabled = false,
  hideLabel = false,
  ...rest
}: MeldTextInputProps) {
  const inputId = useId();
  const messageId = useId();
  const message = errorMessage ?? hint;

  const inputClassName = [styles.input, inputSize === "lg" ? styles.lg : null]
    .filter(Boolean)
    .join(" ");

  return (
    // The message sits OUTSIDE the <label> deliberately. Nested inside it, its
    // text joins the label's accessible name -- "Email address Enter a valid
    // email." -- which is both wrong for screen readers and unqueryable.
    <div className={styles.field}>
      <label
        className={hideLabel ? styles.hiddenLabel : styles.label}
        htmlFor={inputId}
      >
        {label}
      </label>
      {/* The frame paints the stepped edge -- see `text-input.module.css`. */}
      <div className={styles.frame}>
        <input
          {...rest}
          id={inputId}
          className={inputClassName}
          // Stable selector surface -- see the note in `button.tsx`.
          data-size={inputSize}
          disabled={isDisabled}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={message ? messageId : undefined}
        />
      </div>
      {message ? (
        <p
          id={messageId}
          className={[styles.message, errorMessage ? styles.error : null]
            .filter(Boolean)
            .join(" ")}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
