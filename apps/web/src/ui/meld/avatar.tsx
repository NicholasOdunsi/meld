import type { CSSProperties } from "react";
import styles from "./avatar.module.css";

// Brand pigments only. The index is derived from the name so a given person
// keeps the same colour on every screen they appear on -- random per render
// would mean someone changed colour between the list and their profile.
const TONES = [
  { fill: "var(--meld-pink)", text: "var(--meld-text-on-pink)" },
  { fill: "var(--meld-green)", text: "var(--meld-text-on-green)" },
  { fill: "var(--meld-yellow)", text: "var(--meld-text)" },
  { fill: "var(--meld-burgundy)", text: "var(--meld-text-on-burgundy)" },
  { fill: "var(--meld-red)", text: "var(--meld-white)" },
  { fill: "var(--meld-sky)", text: "var(--meld-text-on-sky)" },
  { fill: "var(--meld-burgundy-deep)", text: "var(--meld-text-on-burgundy)" },
] as const;

/**
 * FNV-1a. A plain `hash * 31 + char` sum leaves near-identical strings in
 * adjacent buckets, so two addresses differing only in domain
 * ("…@lmu.edu.ng" / "…@gmail.com") kept landing on the same colour. FNV's
 * multiply-and-xor spreads them properly.
 */
function toneFor(name: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < name.length; index += 1) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return TONES[Math.abs(hash) % TONES.length] as (typeof TONES)[number];
}

export type MeldAvatarProps = {
  /** Email or display name. Its first character becomes the initial. */
  name: string;
};

/**
 * Initial avatar.
 *
 * Decorative: the name it stands for is always rendered as text beside it, so
 * announcing the initial too would just be a stutter.
 */
export function MeldAvatar({ name }: MeldAvatarProps) {
  const tone = toneFor(name);

  return (
    <span
      className={styles.avatar}
      aria-hidden
      style={
        {
          "--meld-avatar-fill": tone.fill,
          "--meld-avatar-text": tone.text,
        } as CSSProperties
      }
    >
      {name.trim().charAt(0)}
    </span>
  );
}
