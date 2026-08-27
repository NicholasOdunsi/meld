import { useId } from "react";
import type { PointerEventHandler, ReactNode } from "react";
import { PixelSidebar } from "@/ui/pixel-icons";
import styles from "./toolbar.module.css";

/**
 * A tool row's relationship to the tab's open panes, driving both its
 * appearance and its `data-state` (the stable test/selector surface -- see
 * `toolbar.test.tsx`'s "reflects the %s state" cases).
 *
 * - `idle`: no pane for this tool exists in the tab.
 * - `open`: a pane exists, but a different pane holds focus. Shown as an
 *   accent pip, not a fill -- it must read as distinct from `active`.
 * - `active`: this tool's pane holds focus. Shown as an ink fill with a
 *   white label, clipped to the pixel corner -- deliberately not a rounded
 *   pill, even though the reference the product owner supplied used one; see
 *   `COMPONENTS.md`.
 */
export type MeldToolbarItemState = "idle" | "open" | "active";

/**
 * Which corner of the plane the toolbar is parked in. Logical rather than
 * physical (`start`/`end`, not `left`/`right`) so the whole thing mirrors with
 * the document's writing direction, like every other inset in the system.
 */
export type MeldToolbarCorner =
  | "top-start"
  | "top-end"
  | "bottom-start"
  | "bottom-end";

export const MELD_TOOLBAR_CORNERS: readonly MeldToolbarCorner[] = [
  "top-start",
  "top-end",
  "bottom-start",
  "bottom-end",
];

const CORNER_LABELS: Record<MeldToolbarCorner, string> = {
  "top-start": "Move toolbar to the top left",
  "top-end": "Move toolbar to the top right",
  "bottom-start": "Move toolbar to the bottom left",
  "bottom-end": "Move toolbar to the bottom right",
};

/**
 * Four quadrants of a square, each one a button. The control IS the diagram --
 * a 2x2 grid of pixel blocks where the filled block is where the panel is
 * standing, so there is nothing to read and nothing to learn.
 *
 * Buttons rather than a drag handle deliberately: snapping a dragged panel to
 * the nearest corner is a nicer gesture but it is unusable by keyboard, and
 * this panel is already fully operable without a pointer.
 */
function MeldToolbarCornerPicker({
  corner,
  onCornerChange,
}: {
  corner: MeldToolbarCorner;
  onCornerChange: (corner: MeldToolbarCorner) => void;
}) {
  return (
    <div
      className={styles.corners}
      role="group"
      aria-label="Toolbar position"
      data-testid="toolbar-corners"
    >
      {MELD_TOOLBAR_CORNERS.map((candidate) => (
        <button
          key={candidate}
          type="button"
          className={styles.corner}
          data-corner={candidate}
          // `aria-pressed` rather than a radiogroup: each quadrant is a
          // complete instruction on its own, and roving tabindex would make
          // four adjacent 8px targets harder to reach, not easier.
          aria-pressed={corner === candidate}
          aria-label={CORNER_LABELS[candidate]}
          onClick={() => onCornerChange(candidate)}
        />
      ))}
    </div>
  );
}

export type MeldToolbarProps = {
  /** Collapses the panel to icon-only rows, letting the plane show through.
   * Owned by the caller -- this primitive renders whichever state it's told. */
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  /** Which corner the panel is parked in. The plane does the positioning. */
  corner?: MeldToolbarCorner;
  /** Omit along with `corner` to hide the picker entirely. */
  onCornerChange?: (corner: MeldToolbarCorner) => void;
  /** The header's label. Hidden visually when collapsed, but it stays in the
   * accessibility tree and keeps naming the panel's `region`. */
  title?: string;
  /** `MeldToolbarItem` rows. */
  children: ReactNode;
};

/**
 * The Room's floating toolbar: a column of tool rows plus a collapse
 * control, framed the same way `MeldPane` is.
 *
 * The visible edge is a frame layer, not a border (see `MeldPane`): a
 * filled, clipped outer with one step of padding, wrapping a clipped inner,
 * so the edge follows the staircase instead of being sliced by it.
 *
 * Collapsing is pure CSS, not conditional rendering: `MeldToolbarItem` always
 * renders its label, and the `data-collapsed` attribute here drives a
 * descendant rule that takes the label visually off-screen without touching
 * the accessibility tree -- the row's accessible name survives collapse
 * (see the "keeps the label available" test).
 */
export function MeldToolbar({
  isCollapsed,
  onCollapsedChange,
  corner,
  onCornerChange,
  title = "Toolbar",
  children,
}: MeldToolbarProps) {
  const titleId = useId();
  const rowsId = useId();

  return (
    <div className={styles.frame}>
      <div
        className={styles.toolbar}
        data-collapsed={isCollapsed ? "true" : "false"}
      >
        {/* A titled header rather than a bare stack of rows, with the collapse
         * control living in it. It used to sit as a full-width row beneath the
         * tools with a divider above it, where it read as a fourth tool rather
         * than as a control acting on the whole panel. */}
        <div className={styles.head}>
          <span className={styles.title} id={titleId}>
            {title}
          </span>
          {corner && onCornerChange && !isCollapsed ? (
            <MeldToolbarCornerPicker
              corner={corner}
              onCornerChange={onCornerChange}
            />
          ) : null}
          <button
            type="button"
            className={styles.collapse}
            onClick={() => onCollapsedChange(!isCollapsed)}
            aria-label={isCollapsed ? "Expand toolbar" : "Collapse toolbar"}
            // The control's own name already says which way it goes, but
            // `aria-expanded` is what tells assistive tech that the rows below
            // are the thing being toggled, and `aria-controls` says which.
            aria-expanded={!isCollapsed}
            aria-controls={rowsId}
          >
            {/* One glyph for both states. A chevron had to flip, which made
             * the icon a claim about direction that then had to stay true;
             * the panel glyph just names what is being toggled, and the
             * `aria-label` plus `aria-expanded` carry the state. */}
            <PixelSidebar pack="basic" size="xs" aria-hidden="true" />
          </button>
        </div>
        <div className={styles.rows} id={rowsId}>
          {children}
        </div>
      </div>
    </div>
  );
}

export type MeldToolbarItemProps = {
  /** The tool's name. Always the accessible name, even collapsed (see
   * `MeldToolbar`'s doc comment). */
  label: string;
  /** Rendered before the label. Mark it `aria-hidden` at the call site. */
  icon: ReactNode;
  state: MeldToolbarItemState;
  /** Refused placements stay in the tab order and in the accessibility tree
   * -- disabled, not hidden -- so `disabledReason` can still be discovered. */
  isDisabled?: boolean;
  /** Why this placement is refused. The caller computes this (see
   * `paneRefusalReason` in `features/rooms/pane-layout.ts`) and passes the
   * sentence in; this primitive only renders it, via `aria-describedby`, not
   * `title` or `aria-label`. */
  disabledReason?: string;
  /** Pressing places the tool. A real button element gets Enter for free. */
  onSelect: () => void;
  /** Arms a pointer drag; the caller owns the threshold, the drop targets
   * and the state machine. Pointer events, not native HTML5 DnD -- native
   * drag proved browser-dependent for rows like these (no ghost at all in
   * some Chromium forks), and pointer events carry none of that variance. */
  onDragPointerDown?: PointerEventHandler<HTMLButtonElement>;
};

/**
 * One row on `MeldToolbar`: press to place the tool where the caller's
 * layout logic decides, drag to choose the spot yourself. See
 * `MeldToolbarItemState` for how the three states read.
 */
export function MeldToolbarItem({
  label,
  icon,
  state,
  isDisabled = false,
  disabledReason,
  onSelect,
  onDragPointerDown,
}: MeldToolbarItemProps) {
  const descriptionId = useId();
  const hasDescription = isDisabled && Boolean(disabledReason);

  return (
    <>
      <button
        type="button"
        className={styles.item}
        data-state={state}
        onPointerDown={isDisabled ? undefined : onDragPointerDown}
        // A native drag starting here fires `pointercancel` and kills the
        // pointer-event drag mid-gesture. Nothing should start one (no
        // `draggable`, `-webkit-user-drag: none`) -- this is the guarantee.
        onDragStart={(event) => event.preventDefault()}
        onClick={onSelect}
        disabled={isDisabled}
        aria-describedby={hasDescription ? descriptionId : undefined}
      >
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.label}>{label}</span>
      </button>
      {hasDescription ? (
        <span id={descriptionId} className={styles.visuallyHidden}>
          {disabledReason}
        </span>
      ) : null}
    </>
  );
}
