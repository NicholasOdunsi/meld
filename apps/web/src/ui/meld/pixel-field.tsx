"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import styles from "./pixel-field.module.css";

const COLUMNS = 90;
const ROWS = 14;
const CELL = 16;

// ROWS * CELL must stay in step with `--meld-pixel-field-height` in
// `tokens.css` (currently 224px). They are the same measurement expressed in
// two places: mismatch it and `preserveAspectRatio="slice"` silently scales the
// squares off the 16px grid instead of cropping.

/** Shards per broken block. */
const SHARDS = 7;
/** Must match `--meld-shatter-duration`; drives particle cleanup. */
const SHATTER_MS = 700;
/** How long a broken block stays gone before it grows back. */
const RESPAWN_MS = 7000;

// Weighted so pink dominates and the rest punctuate, rather than an even
// six-way split -- an even mix reads as confetti, one dominant hue reads as a
// deliberate pattern with accents.
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

/**
 * Deterministic PRNG (mulberry32).
 *
 * `Math.random()` cannot be used for the grid: the field renders on the server
 * and again on the client, and two different scatters would be a hydration
 * mismatch. A fixed seed means both passes produce identical geometry.
 * Particles are exempt -- they only ever exist after a click, so they never
 * take part in hydration.
 */
function createRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Cell = { key: string; x: number; y: number; fill: string };

// Built once at module load, not per render.
const CELLS: Cell[] = (() => {
  const random = createRandom(0x5eed);
  const cells: Cell[] = [];
  for (let row = 0; row < ROWS; row += 1) {
    // Density ramps toward the bottom edge so the field reads as rising out of
    // the base of the page rather than sitting as a flat band. The exponent
    // keeps the top rows sparse instead of fading linearly.
    const depth = row / (ROWS - 1);
    const density = 0.04 + depth ** 2.1 * 0.78;
    for (let column = 0; column < COLUMNS; column += 1) {
      if (random() > density) continue;
      cells.push({
        key: `${column}-${row}`,
        x: column * CELL,
        y: row * CELL,
        fill: PALETTE[Math.floor(random() * PALETTE.length)] as string,
      });
    }
  }
  return cells;
})();

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  fill: string;
  dx: number;
  dy: number;
};

/**
 * The decorative pixel field.
 *
 * A scatter of brand-coloured squares on a 16px grid, densest at the bottom
 * edge. Pinned to the bottom of the viewport -- pages should subtract
 * `--meld-pixel-field-height` when sizing their content area so nothing lands
 * underneath it.
 *
 * Blocks are breakable: clicking one shatters it into shards that arc out and
 * fall, Minecraft-style. Broken blocks grow back after a few seconds so the
 * field can't be permanently flattened.
 */
export function MeldPixelField() {
  const [brokenKeys, setBrokenKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [healingKeys, setHealingKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [particles, setParticles] = useState<readonly Particle[]>([]);
  const nextParticleId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  // Every timeout is tracked so unmounting mid-animation can't leave a pending
  // setState pointing at a dead component.
  const later = useCallback((run: () => void, delay: number) => {
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      run();
    }, delay);
    timers.current.add(timer);
  }, []);

  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const breakCell = useCallback(
    (cell: Cell) => {
      setBrokenKeys((previous) => {
        if (previous.has(cell.key)) return previous;
        const next = new Set(previous);
        next.add(cell.key);
        return next;
      });

      const spawned: Particle[] = [];
      for (let index = 0; index < SHARDS; index += 1) {
        // Shards fan out sideways and always end up lower than they started --
        // the downward bias plus the ease-in curve is what sells gravity.
        const spread = (Math.random() - 0.5) * 3;
        spawned.push({
          id: (nextParticleId.current += 1),
          x: cell.x + Math.random() * (CELL - CELL / 3),
          y: cell.y + Math.random() * (CELL - CELL / 3),
          size: CELL / 3,
          fill: cell.fill,
          dx: spread * CELL,
          dy: (1.2 + Math.random() * 2.2) * CELL,
        });
      }
      setParticles((previous) => [...previous, ...spawned]);

      const spawnedIds = new Set(spawned.map((particle) => particle.id));
      later(() => {
        setParticles((previous) =>
          previous.filter((particle) => !spawnedIds.has(particle.id)),
        );
      }, SHATTER_MS);

      later(() => {
        setBrokenKeys((previous) => {
          const next = new Set(previous);
          next.delete(cell.key);
          return next;
        });
        setHealingKeys((previous) => {
          const next = new Set(previous);
          next.add(cell.key);
          return next;
        });
        later(() => {
          setHealingKeys((previous) => {
            const next = new Set(previous);
            next.delete(cell.key);
            return next;
          });
        }, SHATTER_MS);
      }, RESPAWN_MS);
    },
    [later],
  );

  return (
    <svg
      className={styles.field}
      viewBox={`0 0 ${COLUMNS * CELL} ${ROWS * CELL}`}
      // `slice` crops the pattern on narrow viewports instead of squashing the
      // squares out of square, and anchors it to the bottom edge.
      preserveAspectRatio="xMidYMax slice"
      shapeRendering="crispEdges"
      role="presentation"
      aria-hidden
      focusable="false"
      style={
        { "--meld-shatter-duration": `${SHATTER_MS}ms` } as CSSProperties
      }
    >
      {CELLS.map((cell) =>
        brokenKeys.has(cell.key) ? null : (
          <rect
            key={cell.key}
            className={[
              styles.cell,
              healingKeys.has(cell.key) ? styles.healing : null,
            ]
              .filter(Boolean)
              .join(" ")}
            data-cell={cell.key}
            x={cell.x}
            y={cell.y}
            width={CELL}
            height={CELL}
            fill={cell.fill}
            // pointerdown, not click: the block should give way the instant it
            // is pressed, the way it does when you swing at one.
            onPointerDown={() => breakCell(cell)}
          />
        ),
      )}

      {particles.map((particle) => (
        <rect
          key={particle.id}
          className={styles.particle}
          x={particle.x}
          y={particle.y}
          width={particle.size}
          height={particle.size}
          fill={particle.fill}
          style={
            {
              "--dx": `${particle.dx}px`,
              "--dy": `${particle.dy}px`,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}
