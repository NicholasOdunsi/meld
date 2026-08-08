"use client";

import { Text, type TextType } from "@astryxdesign/core/Text";
import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
import { useMemo } from "react";
import styles from "./wave-text.module.css";

const STAGGER_MS = 45;
// Past ~600ms the trailing characters read as lag rather than as a wave, so
// long labels ("Waiting for your device") clamp instead of stretching.
const MAX_STAGGER_MS = 600;

export type WaveTextProps = {
  text: string;
  type?: TextType;
};

// A label whose characters breathe in sequence. Deliberately knows nothing
// about tasks or AI -- it takes a string. Callers that need status-aware
// copy compose this from AgentActivity.
export function WaveText({ text, type = "label" }: WaveTextProps) {
  // Memoised on `text` alone: a re-render that doesn't change the string
  // must not rebuild these elements, or every animationDelay resets and the
  // wave restarts mid-cycle.
  const characters = useMemo(
    () =>
      Array.from(text).map((character, index) => ({
        // A non-breaking space keeps word gaps visible; a plain space in an
        // inline-block collapses.
        character: character === " " ? "\u00A0" : character,
        delay: `${Math.min(index * STAGGER_MS, MAX_STAGGER_MS)}ms`,
      })),
    [text],
  );

  return (
    <Text as="span" type={type} role="status" aria-live="polite">
      {/* A live region announces its contents, so the plain string has to be
          present in the tree -- an aria-label on a region whose children are
          all aria-hidden would leave nothing to announce. */}
      <VisuallyHidden>{text}</VisuallyHidden>
      <Text as="span" type={type} color="inherit" aria-hidden="true">
        {characters.map(({ character, delay }, index) => (
          <Text
            as="span"
            key={index}
            type={type}
            color="inherit"
            className={styles.character}
            style={{ animationDelay: delay, display: "inline-block" }}
            data-wave-character=""
          >
            {character}
          </Text>
        ))}
      </Text>
    </Text>
  );
}
