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
