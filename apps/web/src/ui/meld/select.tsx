import { useId } from "react";
import type { SelectHTMLAttributes } from "react";
import styles from "./select.module.css";
import { PixelChevronDown } from "@/ui/pixel-icons";

export type MeldSelectOption = { value: string; label: string };

export type MeldSelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "className" | "disabled" | "size" | "id" | "children"
> & {
  label: string;
  options: readonly MeldSelectOption[];
  /** Shown as the empty first option. */
  placeholder?: string;
  errorMessage?: string;
  selectSize?: "md" | "lg";
  isDisabled?: boolean;
  /** Keeps the label for assistive tech but takes it off screen. */
  hideLabel?: boolean;
};

/**
 * Select.
 *
 * A native `<select>` with `appearance: none`, not a custom listbox — the OS
 * picker is better than anything reimplemented here, especially on touch, and
 * it comes with keyboard and assistive-tech support for free.
 */
export function MeldSelect({
  label,
  options,
  placeholder,
  errorMessage,
  selectSize = "md",
  isDisabled = false,
  hideLabel = false,
  value,
  ...rest
}: MeldSelectProps) {
  const selectId = useId();
  const messageId = useId();

  return (
    <div className={styles.field}>
      <label
        className={hideLabel ? styles.hiddenLabel : styles.label}
        htmlFor={selectId}
      >
        {label}
      </label>
      <div className={styles.frame}>
        <select
          {...rest}
          id={selectId}
          value={value}
          className={[
            styles.select,
            selectSize === "lg" ? styles.lg : null,
          ]
            .filter(Boolean)
            .join(" ")}
          data-size={selectSize}
          // Drives the placeholder colour; `:invalid` alone would need the
          // field to be required.
          data-empty={value === "" || value === undefined ? "true" : undefined}
          disabled={isDisabled}
          aria-invalid={errorMessage ? true : undefined}
          aria-describedby={errorMessage ? messageId : undefined}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <PixelChevronDown
          className={styles.chevron}
          width={16}
          height={16}
          aria-hidden
        />
      </div>
      {errorMessage ? (
        <p id={messageId} className={styles.message}>
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
