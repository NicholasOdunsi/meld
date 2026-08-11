"use client";

import { mergeRefs } from "@astryxdesign/core/utils";
import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type Ref,
} from "react";

// Grows the textarea to fit its content instead of scrolling inside a fixed
// box -- the core of the "type directly on the page" feel. Resetting height
// to auto before measuring lets scrollHeight shrink back down when text is
// removed, not just grow.
function useAutoGrow(
  ref: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [ref, value]);
}

const proseTextStyle: CSSProperties = {
  fontFamily: "var(--font-family-body)",
  fontSize: "var(--text-body-size)",
  lineHeight: "var(--text-body-leading)",
  color: "var(--color-text-primary)",
};

const baseFieldStyle: CSSProperties = {
  display: "block",
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  padding: 0,
  margin: 0,
  resize: "none",
  overflow: "hidden",
};

export type DocTextAreaProps = {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  isDisabled?: boolean;
  placeholder?: string;
  hasAutoFocus?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
};

export function DocTextArea({
  ariaLabel,
  value,
  onChange,
  onKeyDown,
  isDisabled = false,
  placeholder,
  hasAutoFocus = false,
  ref,
}: DocTextAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useAutoGrow(textareaRef, value);

  return (
    <textarea
      ref={mergeRefs(ref, textareaRef)}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      disabled={isDisabled}
      placeholder={placeholder}
      autoFocus={hasAutoFocus}
      rows={1}
      style={{ ...baseFieldStyle, ...proseTextStyle }}
    />
  );
}

const titleTextStyle: CSSProperties = {
  fontFamily: "var(--font-family-heading)",
  fontSize: "var(--text-heading-1-size)",
  lineHeight: "var(--text-heading-1-leading)",
  fontWeight: "var(--text-heading-1-weight)" as unknown as number,
  color: "var(--color-text-primary)",
};

// A single-line borderless input. Used for the title (heading-styled) and
// for short structured fields (risk, decision, source link) that shouldn't
// accept newlines the way DocTextArea's fields do.
export function DocInput({
  ariaLabel,
  value,
  onChange,
  isDisabled = false,
  placeholder,
  hasAutoFocus = false,
  variant = "body",
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  placeholder?: string;
  hasAutoFocus?: boolean;
  variant?: "body" | "title";
}) {
  return (
    <input
      type="text"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={isDisabled}
      placeholder={placeholder}
      autoFocus={hasAutoFocus}
      style={{
        ...baseFieldStyle,
        ...(variant === "title" ? titleTextStyle : proseTextStyle),
      }}
    />
  );
}
