import styles from "./pointer-hint.module.css";

export type MeldPointerHintDirection = "left" | "down";

/* Pixel art, kept as pixel art in the source: one character per cell, '#'
 * lit. Both arrows were rasterised from a quadratic Bezier onto this grid, so
 * the curve is a real curve stepped onto the pixel lattice rather than a
 * hand-guessed staircase -- and the arrowheads are solid triangles, because
 * thin diagonal barbs come apart into disconnected cells at this size. */

// Sweeps up and to the left, tip pointing LEFT.
const LEFT_ARROW = [
  ".........#",
  "........##",
  ".......###",
  "......####",
  ".....###########",
  "......####.....###",
  ".......###.......###",
  "........##.........##",
  ".........#..........##",
  ".....................##",
  "......................##",
  ".......................##",
  "........................##",
  ".........................#",
  ".........................##",
  "..........................##",
  "...........................#",
  "...........................##",
  "............................#",
  "............................##",
  ".............................#",
  ".............................#",
  ".............................##",
  "..............................#",
];

// Sweeps right and down, tip pointing DOWN.
const DOWN_ARROW = [
  "..####",
  ".....####",
  "........####",
  "...........###",
  ".............###",
  "...............##",
  "................##",
  ".................##",
  "..................##",
  "...................##",
  "....................#",
  "....................##",
  ".....................#",
  ".....................##",
  "......................#",
  "......................#",
  "......................#",
  "......................#",
  "......................#",
  "..................#########",
  "...................#######",
  "....................#####",
  ".....................###",
  "......................#",
];

const ARROWS: Record<MeldPointerHintDirection, string[]> = {
  left: LEFT_ARROW,
  down: DOWN_ARROW,
};

function PixelArrow({ direction }: { direction: MeldPointerHintDirection }) {
  const rows = ARROWS[direction];
  const width = Math.max(...rows.map((row) => row.length));
  const cells: string[] = [];
  rows.forEach((row, y) => {
    row.split("").forEach((cell, x) => {
      if (cell === "#") cells.push(`${x},${y}`);
    });
  });

  return (
    <svg
      className={styles.arrow}
      viewBox={`0 0 ${width} ${rows.length}`}
      // The steps are the point: never let the renderer smooth them.
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      {cells.map((key) => {
        const [x, y] = key.split(",");
        return <rect key={key} x={x} y={y} width="1" height="1" />;
      })}
    </svg>
  );
}

export type MeldPointerHintProps = {
  /** Where the arrow points. The label sits at its tail. */
  direction: MeldPointerHintDirection;
  children: string;
};

/**
 * A hand-drawn-looking annotation for an empty surface: a pixelated curved
 * arrow with a short line of copy at its tail, pointing at the control it is
 * talking about.
 *
 * Decorative and inert -- `pointer-events: none`, and the arrow is
 * `aria-hidden`. The copy is real text, so it is still read out; the arrow
 * only repeats spatially what the sentence already says.
 */
export function MeldPointerHint({ direction, children }: MeldPointerHintProps) {
  return (
    <p className={styles.hint} data-direction={direction}>
      <PixelArrow direction={direction} />
      <span className={styles.label}>{children}</span>
    </p>
  );
}
