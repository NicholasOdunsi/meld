import { useId } from "react";
import styles from "./orion-hat-mark.module.css";
import { OrionTalkingHat } from "./orion-talking-hat";

export type OrionHatMarkProps = {
  state: "working" | "needs_you";
  color: string;
  hop: boolean;
  label: string;
  size?: "sm" | "md" | "lg";
};

/** A project's status as the Orion hat: swaying while working, curious (and in the sidebar hopping) when it needs you. */
export function OrionHatMark({ state, color, hop, label, size = "sm" }: OrionHatMarkProps) {
  // Stagger hops so several waiting projects don't jump in unison.
  const seed = useId().split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const working = state === "working";
  return (
    <OrionTalkingHat
      appearance="avatar"
      expression={working ? "neutral" : "curious"}
      tint={color}
      aria-label={label}
      className={[styles.hat, styles[size], working ? styles.working : styles.needsYou].join(" ")}
      data-hat-state={state}
      data-hop={!working && hop ? "true" : undefined}
      style={{ ["--hat-hop-delay" as string]: `${(seed % 6) * 0.4}s` }}
    />
  );
}
