import type { ReactNode } from "react";
import Link from "next/link";
import {
  PixelArrowUp,
  PixelChevronDown,
  PixelChevronRight,
} from "@/ui/pixel-icons";
import styles from "./console-row.module.css";

/**
 * The workspace console: a search line over a browsable list.
 *
 * Deliberately *not* a terminal. The field is a search box, every row is a
 * link, and the sections are headings -- typing is the shortcut, never the
 * requirement.
 */
export function MeldConsole({ children }: { children: ReactNode }) {
  return <div className={styles.console}>{children}</div>;
}

export type MeldConsoleSearchProps = {
  placeholder?: string;
  id?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onFocusChange?: (isFocused: boolean) => void;
  onSubmit?: () => void;
  /** The results/actions panel, rendered under the field while typing. */
  children?: ReactNode;
};

export function MeldConsoleSearch({
  placeholder = "Search projects, rooms, people…",
  id,
  value,
  onValueChange,
  onFocusChange,
  onSubmit,
  children,
}: MeldConsoleSearchProps) {
  const hasQuery = (value ?? "").trim().length > 0;

  return (
    <div className={styles.searchWrap}>
      <form
        className={styles.search}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit?.();
        }}
      >
        <span className={styles.brand}>meld</span>
        <input
          id={id}
          className={styles.searchInput}
          placeholder={placeholder}
          aria-label="Search, create, or ask"
          value={value}
          onChange={(event) => onValueChange?.(event.target.value)}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
        />
        <button
          type="submit"
          className={styles.send}
          aria-label="Send"
          disabled={!hasQuery}
        >
          <PixelArrowUp aria-hidden />
        </button>
      </form>
      {children}
    </div>
  );
}

export function MeldConsoleResults({ children }: { children: ReactNode }) {
  return <div className={styles.results}>{children}</div>;
}

/** Groups a project row with its rooms, so feature code needs no raw element. */
export function MeldConsoleGroup({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export function MeldConsoleSection({ children }: { children: ReactNode }) {
  return <div className={styles.section}>{children}</div>;
}

export type MeldConsoleRowProps = {
  icon?: ReactNode;
  name: string;
  /** Quiet text beside the name, e.g. "3 rooms". */
  meta?: string;
  /** Right-aligned quiet text, e.g. "2h ago". */
  trailing?: string;
  /** Right-aligned chip, e.g. the room's stage. Wins over `trailing`. */
  stage?: string;
  href?: string;
  color?: string;
  depth?: "root" | "child";
  isSelected?: boolean;
  /** Present on a project row: renders a chevron and makes the row a button. */
  isExpanded?: boolean;
  onToggle?: () => void;
  /** A quiet "+ New …" row rather than a thing that exists. */
  isAction?: boolean;
  /** Revealed at the row's end on hover or focus, e.g. "add a room here". */
  rowAction?: {
    label: string;
    icon?: ReactNode;
    /** Spoken name, when the visible label needs the project's name for context. */
    accessibleLabel?: string;
    onClick: () => void;
  };
};

export function MeldConsoleRow({
  icon,
  name,
  meta,
  trailing,
  stage,
  href,
  color,
  depth = "root",
  isSelected = false,
  isExpanded,
  onToggle,
  isAction = false,
  rowAction,
}: MeldConsoleRowProps) {
  const body = (
    <>
      {isExpanded === undefined ? null : (
        <span className={styles.chevron} data-open={isExpanded} aria-hidden>
          {isExpanded ? <PixelChevronDown /> : <PixelChevronRight />}
        </span>
      )}
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <span className={styles.name}>{name}</span>
      {meta ? <span className={styles.meta}>{meta}</span> : null}
      {stage ? <span className={styles.stage}>{stage}</span> : null}
      {!stage && trailing ? (
        <span className={styles.trailing}>{trailing}</span>
      ) : null}
    </>
  );

  const attrs = {
    className: styles.row,
    "data-depth": depth,
    "data-color": color,
    "data-selected": isSelected ? "true" : undefined,
    "data-action": isAction ? "true" : undefined,
  };

  const main = onToggle ? (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isExpanded}
      {...attrs}
    >
      {body}
    </button>
  ) : href ? (
    <Link href={href} {...attrs}>
      {body}
    </Link>
  ) : (
    <div {...attrs}>{body}</div>
  );

  if (!rowAction) {
    return main;
  }

  // A sibling, never a child: a button inside a button (or inside a link) is
  // invalid HTML, and clicking it would fire the row as well as itself.
  return (
    <div className={styles.rowWrap}>
      {main}
      <button
        type="button"
        className={styles.rowAction}
        onClick={rowAction.onClick}
        aria-label={rowAction.accessibleLabel ?? rowAction.label}
      >
        {rowAction.icon ? (
          <span className={styles.rowActionIcon}>{rowAction.icon}</span>
        ) : null}
        {rowAction.label}
      </button>
    </div>
  );
}

/**
 * The accordion body. Collapses with `grid-template-rows: 0fr -> 1fr` rather
 * than `height`, which is the one place height-ish animation is sanctioned:
 * there is no transform that reflows siblings. Children stay mounted so the
 * transition has something to animate and so the browser can retarget mid-flight
 * when the chevron is clicked twice quickly.
 */
export function MeldConsoleCollapse({
  isOpen,
  children,
}: {
  isOpen: boolean;
  children: ReactNode;
}) {
  return (
    <div className={styles.collapse} data-open={isOpen} aria-hidden={!isOpen}>
      <div className={styles.collapseInner}>{children}</div>
    </div>
  );
}

export function MeldConsoleSprite({ children }: { children: ReactNode }) {
  return <span className={styles.sprite}>{children}</span>;
}

/**
 * The TEAMMATES block: the rows, plus the ONE card they share.
 *
 * Shared on purpose. Giving every row its own card meant that moving from one
 * row to the next cross-faded two of them at once -- a card leaving and a card
 * arriving, overlapping by one row's height -- which read as a glitch rather
 * than as an interaction. With a single card there is nothing to cross-fade:
 * it travels to the row you are on and swaps its colour and its words.
 *
 * It is also the positioning context the card measures itself against, which
 * is why `.teammate` is deliberately NOT positioned.
 */
export function MeldConsoleTeammates({
  children,
  card,
}: {
  children: ReactNode;
  card?: ReactNode;
}) {
  return (
    <div className={styles.teammates} data-testid="console-teammates">
      {children}
      {card}
    </div>
  );
}

export type MeldConsoleTeammateProps = {
  /** The sprite element, e.g. `<MeldAgent appearance="head" />`. */
  sprite: ReactNode;
  name: string;
  /**
   * What this agent does, shown under the name. Visible rather than
   * hover-only: the row has to teach on its own, because a card nobody opens
   * teaches nobody. The status it replaced said "ready" and was hardcoded.
   */
  description: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  /**
   * Which way this sprite turns to look at whichever row is open: -1 leans
   * back up the list, 1 leans down it, 0 stands straight.
   */
  lean?: -1 | 0 | 1;
  /** True on the row whose own card is open, which stands up rather than turns. */
  isEmphasised?: boolean;
};

/**
 * A teammate in the console: the agent, and what it does.
 *
 * It does NOT own the card -- `MeldConsoleTeammates` holds the single card the
 * whole block shares, so this wrapper stays unpositioned and the card measures
 * itself against the block instead of against one row.
 *
 * A button rather than a div purely so it is reachable by keyboard and can
 * carry `aria-expanded` -- focus opens the card exactly as hover does, so the
 * interaction is not mouse-only. Clicking only focuses; there is nothing
 * inside the card to click.
 */
export function MeldConsoleTeammate({
  sprite,
  name,
  description,
  isOpen,
  onOpenChange,
  lean = 0,
  isEmphasised = false,
}: MeldConsoleTeammateProps) {
  return (
    <div
      className={styles.teammate}
      data-testid="console-teammate"
      data-lean={lean}
      data-emphasis={isEmphasised ? "true" : "false"}
    >
      <button
        type="button"
        className={styles.row}
        data-depth="root"
        aria-expanded={isOpen}
        onMouseEnter={() => onOpenChange(true)}
        onMouseLeave={() => onOpenChange(false)}
        onFocus={() => onOpenChange(true)}
        onBlur={() => onOpenChange(false)}
        onClick={() => onOpenChange(true)}
      >
        <span className={styles.sprite}>{sprite}</span>
        <span className={styles.name}>{name}</span>
        {/* Beside the name, not stacked under it: a second line doubles the
         * height of every row in the section, and this list is furniture
         * rather than the subject of the page. */}
        <span className={styles.teammateDescription}>{description}</span>
      </button>
    </div>
  );
}

export function MeldConsoleSystem({ children }: { children: ReactNode }) {
  return <div className={styles.system}>{children}</div>;
}

export function MeldConsoleSystemLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link className={styles.systemLink} href={href}>
      {children}
    </Link>
  );
}
