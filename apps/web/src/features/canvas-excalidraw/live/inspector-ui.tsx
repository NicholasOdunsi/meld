"use client";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, MoveDiagonal } from "lucide-react";
import { CANVAS_DARK_FILTER, ColourField, type ColourTriggerProps } from "./colour-field";
import { ICON_SIZE } from "./inspector-theme";

// The inspector's field primitives. Every control is a native element or button; all looks come
// from the classes and variables in inspector-theme.ts (no literal colours or sizes here).
// Every field kind shares ONE root class, `orion-i-field`, so height, background and radius cannot drift.

export const FIELD_CLASS = "orion-i-field";

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="orion-i-section">
      <div className="orion-i-section__head">
        <h3 className="orion-i-section__title">{title}</h3>
        <button
          type="button"
          className="orion-i-section__toggle"
          aria-label={`${title} section`}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown size={ICON_SIZE.chevron} aria-hidden />
        </button>
      </div>
      {/* Collapsed content stays mounted (hidden), so typed text and focus state survive a toggle. */}
      <div id={bodyId} className="orion-i-section__body" hidden={!open}>{children}</div>
    </section>
  );
}

// A row of fields side by side.
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="orion-i-row">{children}</div>;
}

// One column of a row: the field plus whatever explains it (an error) under it.
export function FieldCell({ children }: { children: ReactNode }) {
  return <div className="orion-i-cell">{children}</div>;
}

export function FieldShell({ icon, label, trailing, disabled, invalid, children }: {
  icon?: ReactNode;
  // A short inline letter such as "W", drawn where an icon would be.
  label?: string;
  trailing?: ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={FIELD_CLASS} data-disabled={disabled || undefined} data-invalid={invalid || undefined}>
      {icon || label ? <span className="orion-i-field__p">{icon}{label}</span> : null}
      {children}
      {trailing ? <span className="orion-i-field__e">{trailing}</span> : null}
    </div>
  );
}

export function TextField({ ariaLabel, icon, label, value, onChange, onCommit, onKeyDown, disabled, invalid, trailing, inputMode, describedBy }: {
  ariaLabel: string;
  icon?: ReactNode;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  // Enter or leaving the box (blur) commits what was typed.
  onCommit: () => void;
  // Every key except Enter, which is the commit.
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  invalid?: boolean;
  trailing?: ReactNode;
  inputMode?: "numeric" | "text";
  describedBy?: string;
}) {
  return (
    <FieldShell icon={icon} label={label} trailing={trailing} disabled={disabled} invalid={invalid}>
      <input
        className="orion-i-input"
        type="text"
        aria-label={ariaLabel}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        inputMode={inputMode}
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onCommit();
          } else onKeyDown?.(event);
        }}
      />
    </FieldShell>
  );
}

type Option = { value: string; label: string };
type MenuPlace = { left: number; width: number; top?: number; bottom?: number };
// Room the list needs below the field before it opens upward instead (matches --orion-i-menu-max-h).
const MENU_ROOM = 240;
const MENU_GAP = 4;

export function SelectField({ ariaLabel, icon, value, options, onChange, trailingText, disabled }: {
  ariaLabel: string;
  icon?: ReactNode;
  value: string | null;
  options: readonly Option[];
  onChange: (value: string) => void;
  // Muted text inside the row, after the chosen label (for example the font actually showing).
  trailingText?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<MenuPlace | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const chosen = options.find((option) => option.value === value);

  function openList() {
    if (disabled) return;
    setActive(Math.max(0, options.findIndex((option) => option.value === value)));
    setOpen(true);
  }
  function closeList(refocus: boolean) {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }
  function pick(option: Option) {
    closeList(true);
    onChange(option.value);
  }

  // Where the list goes (fixed, so a scrolling panel cannot clip it), then focus moves into it.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const room = window.innerHeight - rect.bottom;
    setPlace(
      room < MENU_ROOM && rect.top > room
        ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + MENU_GAP }
        : { left: rect.left, width: rect.width, top: rect.bottom + MENU_GAP },
    );
    listRef.current?.focus();
  }, [open]);
  // A press outside, or the page moving under the list, closes it.
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && (listRef.current?.contains(target) || rootRef.current?.contains(target))) return;
      closeList(false);
    };
    const away = (event: Event) => {
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
      closeList(false);
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", away, true);
    window.addEventListener("resize", away);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", away, true);
      window.removeEventListener("resize", away);
    };
  }, [open]);

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      if (!open) openList();
    }
  }
  function onListKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const last = options.length - 1;
    switch (event.key) {
      case "ArrowDown": setActive((index) => Math.min(last, index + 1)); break;
      case "ArrowUp": setActive((index) => Math.max(0, index - 1)); break;
      case "Home": setActive(0); break;
      case "End": setActive(last); break;
      case "Enter":
      case " ": {
        const option = options[active];
        if (option) pick(option);
        break;
      }
      // Only the list closes: the event comes from inside a listbox, which the board treats as a popup.
      case "Escape": closeList(true); break;
      case "Tab": closeList(false); return;
      default: return;
    }
    event.preventDefault();
  }

  const menuStyle: CSSProperties | undefined = place ? { left: place.left, width: place.width, top: place.top, bottom: place.bottom } : { visibility: "hidden" };
  return (
    <div ref={rootRef} className={FIELD_CLASS} data-disabled={disabled || undefined}>
      {icon ? <span className="orion-i-field__p">{icon}</span> : null}
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        className="orion-i-hit"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled}
        onClick={() => (open ? closeList(false) : openList())}
        onKeyDown={onTriggerKeyDown}
        // A keyboard press already opened the list on keydown; stop the button's own click from toggling it shut.
        onKeyUp={(event) => { if (event.key === " ") event.preventDefault(); }}
      >
        <span className="orion-i-hit__v">{chosen?.label ?? "—"}</span>
        {trailingText ? <span className="orion-i-hit__m">{trailingText}</span> : null}
      </button>
      <span className="orion-i-field__e" aria-hidden><ChevronDown size={ICON_SIZE.chevron} /></span>
      {open
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              aria-activedescendant={`${listId}-${active}`}
              tabIndex={-1}
              className="orion-i-menu orion-i-scope"
              style={menuStyle}
              onKeyDown={onListKeyDown}
              onBlur={(event) => {
                const next = event.relatedTarget;
                if (!(next instanceof Node) || !listRef.current?.contains(next)) closeList(false);
              }}
            >
              {options.map((option, index) => (
                <li
                  key={option.value}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.value === value}
                  data-active={index === active || undefined}
                  className="orion-i-menu__item"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(option)}
                >
                  {option.label}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}

// "#112233" is shown as "112233", like the mock; anything else (a name, "None") as it is.
const colourText = (value: string | null) => (value ? (value.startsWith("#") ? value.slice(1).toUpperCase() : value) : "None");

// The colour field's trigger, drawn as a field row. The visible hex describes the button (its name is the label).
function ColourTrigger({ label, value, canvasFilter, isDisabled, onClick }: ColourTriggerProps) {
  const textId = useId();
  return (
    <FieldShell
      disabled={isDisabled}
      icon={
        // The swatch shows the user's own colour, so its fill is the one literal allowed here.
        <span
          className="orion-i-swatch"
          data-empty={value ? undefined : ""}
          data-swatch={value ?? undefined}
          style={value ? { background: value, filter: canvasFilter ? CANVAS_DARK_FILTER : undefined } : undefined}
        />
      }
    >
      <button type="button" className="orion-i-hit" aria-label={label} aria-describedby={textId} disabled={isDisabled} onClick={onClick}>
        <span id={textId} className="orion-i-hit__v">{colourText(value)}</span>
      </button>
    </FieldShell>
  );
}

export function ColourRow({ ariaLabel, value, used, disabled, onChange, onClear, canvasFilter = false }: {
  ariaLabel: string;
  value: string | null;
  used: readonly string[];
  disabled?: boolean;
  onChange: (hex: string) => void;
  onClear?: () => void;
  canvasFilter?: boolean;
}) {
  return (
    <ColourField
      label={ariaLabel}
      value={value}
      used={used}
      isDisabled={disabled}
      onChange={onChange}
      onClear={onClear}
      canvasFilter={canvasFilter}
      trigger={ColourTrigger}
    />
  );
}

export function AutoIcon() {
  return (
    <span className="orion-i-auto" role="img" aria-label="Auto size" title="Auto size">
      <MoveDiagonal size={ICON_SIZE.auto} aria-hidden />
    </span>
  );
}
