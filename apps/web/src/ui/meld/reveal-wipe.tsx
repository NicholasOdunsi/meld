"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useIsMounted } from "@/ui/use-is-mounted";
import styles from "./reveal-wipe.module.css";

const CELL = 28;

// Same weighted palette as `MeldPixelField` -- pink dominates, the rest
// punctuate, so the sweep reads as a deliberate pattern rather than confetti.
const PALETTE = [
  "var(--meld-pink)",
  "var(--meld-pink)",
  "var(--meld-pink)",
  "var(--meld-yellow)",
  "var(--meld-yellow)",
  "var(--meld-red)",
  "var(--meld-sky)",
  "var(--meld-green)",
  "var(--meld-burgundy)",
];

/** How long the sweep takes to cross from the bottom row to the top row. */
const SWEEP_MS = 340;
/** How long each individual block's own fade takes. Rows overlap rather than
 * strictly taking turns -- SWEEP_MS is the stagger between rows, not a gap
 * between them -- which is what reads as one continuous wave instead of a
 * scanline. */
const FADE_MS = 320;
/** How long the fully-covered screen holds before the reveal wave starts. */
const HOLD_MS = 180;
/** Random spread added to each block's delay so the sweep looks organic
 * rather than a mechanical row-by-row scan. */
const JITTER_MS = 60;

const COVER_DONE_MS = SWEEP_MS + FADE_MS;
const REVEAL_STARTS_MS = COVER_DONE_MS + HOLD_MS;
const TOTAL_MS = REVEAL_STARTS_MS + SWEEP_MS + FADE_MS;

type Cell = { key: string; x: number; y: number; color: string; delay: number };

// A plain top-level function rather than inlined in the `useMemo` below:
// building the grid genuinely is a one-off random draw (this component only
// ever exists client-side, computed once per mount -- see the doc comment),
// but calling `Math.random()` directly inside a hook body reads, to React's
// purity lint, indistinguishable from a component that produces different
// output on every render. Keeping the impure work in its own function called
// once by `useMemo` is the same shape `MeldPixelField` uses at module scope.
function buildGrid(width: number, height: number) {
  const cols = Math.ceil(width / CELL);
  const rows = Math.ceil(height / CELL);
  const maxRow = Math.max(1, rows - 1);
  const cells: Cell[] = [];

  for (let row = 0; row < rows; row += 1) {
    // Bottom row (largest index) gets the smallest delay, so it fades in
    // first -- the wave reads as rising even though every block is doing
    // nothing but a plain opacity fade in place.
    const progress = 1 - row / maxRow;
    for (let col = 0; col < cols; col += 1) {
      const jitter = (Math.random() - 0.5) * JITTER_MS;
      cells.push({
        key: `${col}-${row}`,
        x: col * CELL,
        y: row * CELL,
        color: PALETTE[Math.floor(Math.random() * PALETTE.length)] as string,
        delay: Math.max(0, progress * SWEEP_MS + jitter),
      });
    }
  }

  return { cols, rows, cells };
}

export type MeldRevealWipeProps = {
  /** Fires once the reveal wave has fully cleared. Not called more than once. */
  onComplete: () => void;
};

/**
 * A full-viewport transition, not a loading screen: the same pixel-field
 * pattern covers the screen via a staggered wave of blocks fading in
 * (bottom row first, top row a beat later -- the same fade the footer
 * field's broken blocks already use to grow back, just choreographed as a
 * sweep instead of scattered respawns), holds briefly, then fades back out
 * the same way. Nothing translates or slides; the sense of motion comes
 * entirely from the stagger.
 *
 * Caller decides whether to mount it at all -- this component does not check
 * `prefers-reduced-motion` itself.
 */
export function MeldRevealWipe({ onComplete }: MeldRevealWipeProps) {
  const mounted = useIsMounted();

  const grid = useMemo(() => {
    if (!mounted) return null;
    return buildGrid(window.innerWidth, window.innerHeight);
  }, [mounted]);

  const [phase, setPhase] = useState<"in" | "out">("in");
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (!grid) return undefined;

    const revealTimer = setTimeout(
      () => setPhase("out"),
      REVEAL_STARTS_MS,
    );
    const completeTimer = setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current();
    }, TOTAL_MS);

    return () => {
      clearTimeout(revealTimer);
      clearTimeout(completeTimer);
    };
  }, [grid]);

  if (!grid) return null;

  return (
    <svg
      className={styles.field}
      viewBox={`0 0 ${grid.cols * CELL} ${grid.rows * CELL}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="presentation"
      aria-hidden
      focusable="false"
    >
      {grid.cells.map((cell) => (
        <rect
          key={cell.key}
          className={[styles.cell, phase === "in" ? styles.fadeIn : styles.fadeOut]
            .filter(Boolean)
            .join(" ")}
          x={cell.x}
          y={cell.y}
          width={CELL}
          height={CELL}
          fill={cell.color}
          style={{ "--wipe-delay": `${cell.delay}ms` } as CSSProperties}
        />
      ))}
    </svg>
  );
}
