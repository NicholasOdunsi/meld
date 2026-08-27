"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Constant motion, so the cadence is linear -- an eased typewriter reads as a
// stutter. Deleting runs faster than typing because nobody watches a backspace.
const TYPE_MS = 55;
const DELETE_MS = 28;
const HOLD_MS = 1600;
const BLANK_MS = 320;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// Read through useSyncExternalStore rather than an effect that sets state:
// the media query is external state React can subscribe to directly, and
// mirroring it into a useState made the first paint animate before the effect
// corrected it.
function subscribeToReducedMotion(onStoreChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

function reducedMotionSnapshot() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function serverReducedMotionSnapshot() {
  return false;
}

export type TypewriterOptions = {
  phrases: string[];
  /** Freezes the animation -- passed `true` while the field is in use. */
  isPaused?: boolean;
};

/**
 * Cycles placeholder examples: type one, hold it, clear it, type the next.
 *
 * It exists to *explain* — the field accepts more than a search term, and a
 * static placeholder can only ever advertise one of those. That is why a
 * looping animation is justified here and would not be on a label.
 *
 * Two things it must never do: run while someone is typing (it would fight
 * their own text for attention), and move for a reader who asked for less
 * motion. Both callers get the full first phrase, held still.
 */
export function useTypewriter({ phrases, isPaused = false }: TypewriterOptions) {
  const [text, setText] = useState("");
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    reducedMotionSnapshot,
    serverReducedMotionSnapshot,
  );

  const isStill = isPaused || prefersReducedMotion || phrases.length === 0;

  useEffect(() => {
    if (isStill) return;

    const phrase = phrases[phraseIndex % phrases.length];

    if (!isDeleting && text === phrase) {
      const timer = setTimeout(() => setIsDeleting(true), HOLD_MS);
      return () => clearTimeout(timer);
    }

    if (isDeleting && text === "") {
      const timer = setTimeout(() => {
        setIsDeleting(false);
        setPhraseIndex((current) => (current + 1) % phrases.length);
      }, BLANK_MS);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(
      () => {
        setText((current) =>
          isDeleting
            ? phrase.slice(0, current.length - 1)
            : phrase.slice(0, current.length + 1),
        );
      },
      isDeleting ? DELETE_MS : TYPE_MS,
    );
    return () => clearTimeout(timer);
  }, [text, isDeleting, phraseIndex, phrases, isStill]);

  if (isStill) {
    return phrases[0] ?? "";
  }

  return text;
}
