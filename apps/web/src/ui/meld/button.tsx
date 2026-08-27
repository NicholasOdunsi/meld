import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./button.module.css";

export type MeldButtonVariant = "primary" | "secondary" | "ghost";
export type MeldButtonSize = "sm" | "md" | "lg";

export type MeldButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "disabled"
> & {
  /** Visible button text. Also the accessible name. */
  label: string;
  /** Rendered before the label. Decorative -- give it `aria-hidden`. */
  icon?: ReactNode;
  variant?: MeldButtonVariant;
  size?: MeldButtonSize;
  /** Stretch to the container, accounting for the notch frame's margin. */
  fullWidth?: boolean;
  /** Shows the pixel ellipsis and blocks interaction. */
  isLoading?: boolean;
  isDisabled?: boolean;
};

/**
 * The Meld button.
 *
 * Flat, square, and framed by the 2px notch -- the corner pixel is genuinely
 * absent rather than rounded. No offset shadow: nothing in this system
 * protrudes. See `COMPONENTS.md` for the full contract.
 */
export function MeldButton({
  label,
  icon,
  variant = "primary",
  size = "md",
  fullWidth = false,
  isLoading = false,
  isDisabled = false,
  type = "button",
  ...rest
}: MeldButtonProps) {
  const className = [
    styles.button,
    styles[variant],
    size === "sm" ? styles.sm : null,
    size === "lg" ? styles.lg : null,
    fullWidth ? styles.fullWidth : null,
    isLoading ? styles.loading : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type}
      className={className}
      // Stable selector surface. Hashed CSS-module class names are useless to
      // target from tests or from a parent, so variant and size are reflected
      // as data attributes the way Astryx did.
      data-variant={variant}
      data-size={size}
      disabled={isDisabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {icon}
      {label}
    </button>
  );
}
