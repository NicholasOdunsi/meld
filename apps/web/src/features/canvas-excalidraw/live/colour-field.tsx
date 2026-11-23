"use client";
import { useId, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type ComponentType } from "react";
import { CircleDashed } from "lucide-react";
import { Popover } from "@astryxdesign/core/Popover";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { PALETTE, normaliseHex } from "./colour-palette";
import { ICON_SIZE } from "./inspector-theme";

export type ColourFieldProps = {
  label: string;
  value: string | null;
  used: readonly string[];
  isDisabled?: boolean;
  onChange: (hex: string) => void;
  onClear?: () => void;
  // The board's dark canvas draws every colour through Excalidraw's theme filter. Shape colours turn
  // this on so a swatch looks like the shape on the canvas; screens (plain iframes) leave it off.
  canvasFilter?: boolean;
  // Draws the trigger (the inspector's field row). It must render one native <button> wired to
  // `onClick`, which the popover anchors to and the Escape-reopen guard needs.
  trigger: ComponentType<ColourTriggerProps>;
};
export type ColourTriggerProps = { label: string; value: string | null; canvasFilter: boolean; isDisabled: boolean; onClick: () => void };
// Excalidraw 0.18 dark theme: `.excalidraw.theme--dark { --theme-filter: invert(93%) hue-rotate(180deg) }`.
export const CANVAS_DARK_FILTER = "invert(93%) hue-rotate(180deg)";
// The swatch grid is one tab stop (roving tabindex); arrow keys move within it. Rows are the palette rows
// followed by the "used" colours as one row; the DOM order of the swatch buttons matches that flat order.
// A swatch shows the user's own colour: it reaches the sheet as a variable, and the dot is a pseudo-element
// of the button so the dark-canvas filter never touches the hover ring.
function SwatchButton({
  hex,
  index,
  isStop,
  isCurrent,
  filtered,
  onPick,
  onStep,
}: {
  hex: string;
  index: number;
  isStop: boolean;
  isCurrent: boolean;
  filtered: boolean;
  onPick: (hex: string) => void;
  onStep: (event: KeyboardEvent<HTMLElement>, index: number) => void;
}) {
  const style = { "--orion-i-pop-fill": hex, "--orion-i-pop-filter": filtered ? CANVAS_DARK_FILTER : "none" } as CSSProperties;
  return (
    <button
      type="button"
      className="orion-i-pop__sw"
      aria-label={hex}
      title={hex}
      aria-current={isCurrent ? "true" : undefined}
      data-swatch={hex}
      style={style}
      tabIndex={isStop ? 0 : -1}
      onClick={() => onPick(hex)}
      onKeyDown={(event) => onStep(event, index)}
    />
  );
}
export function ColourField({ label, value, used, isDisabled, onChange, onClear, canvasFilter = false, trigger: Trigger }: ColourFieldProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [error, setError] = useState(false);
  const [stop, setStop] = useState<number | null>(null);
  const errorId = useId();
  // Set when Escape closed the popup. The popover ignores a trigger click in the first 50ms after
  // any close (its guard against light dismiss reopening at once), which also swallowed a quick
  // reopen after Escape; the trigger reopens it itself in that case.
  const escaped = useRef(false);
  const rows: readonly (readonly string[])[] = used.length > 0 ? [...PALETTE, used] : PALETTE;
  const flat = rows.flat();
  const current = value ? normaliseHex(value) : null;
  const tabStop = stop ?? Math.max(0, flat.indexOf(current ?? ""));
  function step(event: KeyboardEvent<HTMLElement>, index: number) {
    const { key } = event;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return;
    let target = index;
    if (key === "ArrowLeft") target = index - 1;
    else if (key === "ArrowRight") target = index + 1;
    else {
      let start = 0;
      let row = 0;
      while (row < rows.length - 1 && index >= start + rows[row].length) start += rows[row++].length;
      const col = index - start;
      const to = row + (key === "ArrowUp" ? -1 : 1);
      if (to < 0 || to >= rows.length) return;
      let toStart = 0;
      for (let r = 0; r < to; r++) toStart += rows[r].length;
      target = toStart + Math.min(col, rows[to].length - 1);
    }
    const root = event.currentTarget.closest("[role=dialog], [popover]");
    const next = root?.querySelectorAll<HTMLElement>("button[aria-label^='#']")[target];
    if (!next) return;
    event.preventDefault();
    setStop(target);
    next.focus();
  }
  function pick(hex: string) {
    onChange(hex);
    setOpen(false);
  }
  function commit() {
    if (text.trim() === "" || normaliseHex(text) === current) {
      setError(false);
      return;
    }
    const hex = normaliseHex(text);
    if (!hex) {
      setError(true);
      return;
    }
    setError(false);
    pick(hex);
  }
  const reset = () => {
    setStop(null);
    setText(value ?? "");
    setError(false);
  };
  // Focus moving inside the popup (the popover focuses its first swatch a frame after opening, which
  // can land while the hex is being typed) is not leaving the hex box: only leaving the popup commits.
  function onHexBlur(event: FocusEvent<HTMLElement>) {
    const root = event.currentTarget.closest("[role=dialog], [popover]");
    if (root && event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
    commit();
  }
  const reopenAfterEscape = () => {
    if (open || !escaped.current || isDisabled) return;
    escaped.current = false;
    reset();
    setOpen(true);
  };
  const content = (
    <VStack className="orion-i-pop orion-i-scope" onKeyDownCapture={(event) => { if (event.key === "Escape") escaped.current = true; }}>
      {PALETTE.map((row, r) => (
        <HStack key={row.join()} wrap="wrap" className="orion-i-pop__row">
          {row.map((hex, c) => {
            const index = PALETTE.slice(0, r).reduce((n, x) => n + x.length, 0) + c;
            return <SwatchButton key={hex} hex={hex} index={index} isStop={index === tabStop} isCurrent={hex === current} filtered={canvasFilter} onPick={pick} onStep={step} />;
          })}
        </HStack>
      ))}
      {used.length > 0 ? (
        <VStack className="orion-i-pop__group">
          <p className="orion-i-pop__label">Used on this screen</p>
          <HStack wrap="wrap" className="orion-i-pop__row">
            {used.map((hex, c) => {
              const index = PALETTE.flat().length + c;
              return <SwatchButton key={hex} hex={hex} index={index} isStop={index === tabStop} isCurrent={hex === current} filtered={canvasFilter} onPick={pick} onStep={step} />;
            })}
          </HStack>
        </VStack>
      ) : null}
      {onClear ? (
        <button
          type="button"
          className="orion-i-pop__none"
          onClick={() => {
            onClear();
            setOpen(false);
          }}
        >
          <CircleDashed size={ICON_SIZE.field} aria-hidden />
          None
        </button>
      ) : null}
      <input
        className="orion-i-hex"
        type="text"
        aria-label="Hex"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(false);
        }}
        onBlur={onHexBlur}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
      />
      {error ? <p id={errorId} role="alert" className="orion-i-error">Use a colour like #1A2B3C.</p> : null}
    </VStack>
  );
  return (
    <Popover
      content={content}
      placement="below"
      isOpen={open && !isDisabled}
      onOpenChange={(next) => {
        if (next) {
          escaped.current = false;
          reset();
        }
        setOpen(next);
      }}
      isEnabled={!isDisabled}
      label={label}
    >
      {/* The name stays the field label; the current colour is read out as its description. */}
      <Trigger label={label} value={value} canvasFilter={canvasFilter} isDisabled={!!isDisabled} onClick={reopenAfterEscape} />
    </Popover>
  );
}
export default ColourField;
