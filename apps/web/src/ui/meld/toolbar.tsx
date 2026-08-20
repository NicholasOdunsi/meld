import { useId } from "react";
import type { DragEventHandler, ReactNode } from "react";
import { PixelChevronLeft, PixelChevronRight } from "@/ui/pixel-icons";
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

export type MeldToolbarProps = {
  /** Collapses the panel to icon-only rows, letting the plane show through.
   * Owned by the caller -- this primitive renders whichever state it's told. */
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
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
  children,
}: MeldToolbarProps) {
  return (
    <div className={styles.frame}>
      <div
        className={styles.toolbar}
        data-collapsed={isCollapsed ? "true" : "false"}
      >
        <div className={styles.rows}>{children}</div>
        <button
          type="button"
          className={styles.collapse}
          onClick={() => onCollapsedChange(!isCollapsed)}
          aria-label={isCollapsed ? "Expand toolbar" : "Collapse toolbar"}
        >
          {isCollapsed ? (
            <PixelChevronRight pack="basic" size="sm" aria-hidden="true" />
          ) : (
            <PixelChevronLeft pack="basic" size="sm" aria-hidden="true" />
          )}
        </button>
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
  /** Dragging chooses where the tool lands; the caller owns the drop target. */
  onDragStart?: DragEventHandler<HTMLButtonElement>;
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
  onDragStart,
}: MeldToolbarItemProps) {
  const descriptionId = useId();
  const hasDescription = isDisabled && Boolean(disabledReason);

  return (
    <>
      <button
        type="button"
        className={styles.item}
        data-state={state}
        draggable
        onDragStart={onDragStart}
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
