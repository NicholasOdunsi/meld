import { createContext, useContext, useRef, useState } from "react";
import type { DragEventHandler, KeyboardEvent, ReactNode } from "react";
import { PixelPlus, PixelX } from "@/ui/pixel-icons";
import styles from "./tab-strip.module.css";

/**
 * A tab's relationship to who put it there.
 *
 * - `workstream`: named after the work, placed by someone, renameable and
 *   closable.
 * - `generated`: the system-authored Overview tab. Pinned first, accent
 *   -outlined so it reads as *built*, not placed -- never renameable, never
 *   closable, never reorderable. See the "no close control" test.
 */
export type MeldTabVariant = "workstream" | "generated";

type TabStripContextValue = {
  activeTabId: string;
  onActivate: (tabId: string) => void;
};

const TabStripContext = createContext<TabStripContextValue | null>(null);

function useTabStripContext(componentName: string): TabStripContextValue {
  const context = useContext(TabStripContext);
  if (!context) {
    throw new Error(`${componentName} must be rendered inside MeldTabStrip.`);
  }
  return context;
}

const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "Home", "End"]);

export type MeldTabStripProps = {
  /** The tab currently showing on the plane. Drives both `aria-selected` and
   * the roving `tabIndex` -- selection, not DOM focus, decides which tab is
   * the one stop in the page's sequential tab order. */
  activeTabId: string;
  onActivate: (tabId: string) => void;
  onAdd: () => void;
  /** Forwarded to the "+" button's native `onDrop`, so a tool dragged onto
   * it can open a new tab. Wiring only -- the drag/drop behaviour itself
   * lands in a later task. `onDragOver` is handled internally and only
   * calls `preventDefault()` (which is what allows a drop to fire at all)
   * when this is provided. */
  onDropOnAdd?: DragEventHandler<HTMLButtonElement>;
  /** An opaque slot, rendered right-aligned exactly as handed in. This
   * primitive doesn't know what presence is and never will -- it doesn't
   * model participants. */
  presence?: ReactNode;
  /** `MeldTab` elements. */
  children: ReactNode;
};

/**
 * The Room's tab strip: a system-generated Overview tab pinned first,
 * workstream tabs named after the work, a "+" to start another, and an
 * opaque presence slot at the trailing edge.
 *
 * A real `tablist`/`tab` pair with roving tabindex: only the active tab
 * (by `activeTabId`, not DOM focus) is a stop in the page's sequential tab
 * order (`tabIndex={0}`); the rest are `tabIndex={-1}`. Arrow keys move
 * focus *within* the strip without changing selection -- manual activation,
 * not automatic -- because switching a tab here can swap heavy pane content
 * on the plane; `Enter`/`Space` on a focused tab is what actually activates
 * it. See `MeldTab`.
 *
 * Active/generated tabs are told apart from `MeldTab`'s own state via
 * `MeldTabStrip`'s context rather than `cloneElement`-injected props, so
 * `MeldTab`'s public props stay exactly the caller-facing shape described
 * in its own doc comment -- no strip-internal plumbing leaks into it.
 */
export function MeldTabStrip({
  activeTabId,
  onActivate,
  onAdd,
  onDropOnAdd,
  presence,
  children,
}: MeldTabStripProps) {
  const tablistRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!ARROW_KEYS.has(event.key)) return;

    const container = tablistRef.current;
    if (!container) return;

    const tabs = Array.from(
      container.querySelectorAll<HTMLElement>('[role="tab"]'),
    );
    if (tabs.length === 0) return;

    const currentIndex = tabs.indexOf(document.activeElement as HTMLElement);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }

    event.preventDefault();
    tabs[nextIndex]?.focus();
  };

  const handleDragOver: DragEventHandler<HTMLButtonElement> = (event) => {
    if (!onDropOnAdd) return;
    // Dropping only fires if the dragover handler allows it.
    event.preventDefault();
  };

  return (
    <div className={styles.strip}>
      <div
        ref={tablistRef}
        role="tablist"
        aria-label="Room tabs"
        className={styles.tablist}
        onKeyDown={handleKeyDown}
      >
        <TabStripContext.Provider value={{ activeTabId, onActivate }}>
          {children}
        </TabStripContext.Provider>
      </div>
      <button
        type="button"
        className={styles.add}
        aria-label="New tab"
        onClick={onAdd}
        onDragOver={handleDragOver}
        onDrop={onDropOnAdd}
      >
        <PixelPlus pack="basic" size="sm" aria-hidden="true" />
      </button>
      {presence ? <div className={styles.presence}>{presence}</div> : null}
    </div>
  );
}

export type MeldTabProps = {
  tabId: string;
  /** Visible content, so Archivo -- not the Pixelify voice metadata gets. */
  label: string;
  variant: MeldTabVariant;
  /** No close control at all when `false` -- not a disabled one. Defaults
   * `false` so a caller has to opt a tab into being closable. A `generated`
   * tab renders no close control regardless of this value -- the primitive
   * enforces that itself rather than trusting every call site to remember
   * not to pass it. */
  isClosable?: boolean;
  /** Fired with the trimmed next label on commit (`Enter` or blur). Omit to
   * leave a tab unrenameable even if it's a `workstream` tab -- e.g. while
   * a rename request is in flight elsewhere. Never called for a `generated`
   * tab; double-click does nothing there. */
  onRename?: (nextLabel: string) => void;
  onClose?: () => void;
};

/**
 * One tab on `MeldTabStrip`. Selection comes from the strip's context, not
 * a prop here -- this component's own surface is exactly `tabId`, `label`,
 * `variant`, `isClosable`, `onRename`, `onClose`, matching what a caller
 * actually decides per tab.
 *
 * Rename is double-click on the label turning it into an input: `Enter` or
 * blur commits, `Escape` cancels and restores the original label. Only
 * `workstream` tabs with `onRename` wired respond to the double-click at
 * all -- the generated tab is deliberately inert to it.
 */
export function MeldTab({
  tabId,
  label,
  variant,
  isClosable = false,
  onRename,
  onClose,
}: MeldTabProps) {
  const { activeTabId, onActivate } = useTabStripContext("MeldTab");
  const isActive = tabId === activeTabId;
  const canRename = variant === "workstream" && Boolean(onRename);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);

  const startRename = () => {
    if (!canRename) return;
    setDraftLabel(label);
    setIsRenaming(true);
  };

  const commitRename = () => {
    setIsRenaming(false);
    const trimmed = draftLabel.trim();
    if (trimmed && trimmed !== label) {
      onRename?.(trimmed);
    }
  };

  const cancelRename = () => {
    setDraftLabel(label);
    setIsRenaming(false);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Stops every key -- not just Enter/Escape -- from bubbling to the
    // tab's own `onKeyDown`. Without this, a space typed into the input
    // still bubbles to the tab wrapper's Enter/Space activation handler,
    // which calls `preventDefault()` and silently eats the space the
    // input was about to insert; arrow keys would likewise get read as
    // strip navigation instead of moving the caret.
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      commitRename();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(tabId);
    }
  };

  return (
    <div
      role="tab"
      aria-selected={isActive ? "true" : "false"}
      tabIndex={isActive ? 0 : -1}
      data-variant={variant}
      data-active={isActive ? "true" : "false"}
      className={styles.tab}
      onClick={() => onActivate(tabId)}
      onKeyDown={handleTabKeyDown}
    >
      {isRenaming ? (
        <input
          className={styles.rename}
          value={draftLabel}
          aria-label={`Rename ${label}`}
          autoFocus
          onChange={(event) => setDraftLabel(event.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={commitRename}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <span
          className={styles.label}
          onDoubleClick={canRename ? startRename : undefined}
        >
          {label}
        </span>
      )}
      {isClosable && !isRenaming && variant !== "generated" ? (
        <button
          type="button"
          className={styles.close}
          aria-label={`Close ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose?.();
          }}
        >
          <PixelX pack="basic" size="sm" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
