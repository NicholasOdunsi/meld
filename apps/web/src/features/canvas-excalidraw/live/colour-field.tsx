"use client";
import { useState, type KeyboardEvent } from "react";
import { Popover } from "@astryxdesign/core/Popover";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { PALETTE, normaliseHex } from "./colour-palette";

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
};
// Excalidraw 0.18 dark theme: `.excalidraw.theme--dark { --theme-filter: invert(93%) hue-rotate(180deg) }`.
export const CANVAS_DARK_FILTER = "invert(93%) hue-rotate(180deg)";
// A swatch shows the user's own colour, so its fill is the one literal value allowed here.
function Swatch({ hex, filtered = false }: { hex: string | null; filtered?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden>
      {hex ? (
        <circle cx="8" cy="8" r="6.5" fill={hex} stroke="var(--color-border-emphasized)" style={filtered ? { filter: CANVAS_DARK_FILTER } : undefined} data-swatch={hex} />
      ) : (
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--color-border-emphasized)" strokeDasharray="2 2" />
      )}
    </svg>
  );
}
// The swatch grid is one tab stop (roving tabindex); arrow keys move within it. Rows are the palette rows
// followed by the "used" colours as one row; the DOM order of the swatch buttons matches that flat order.
function SwatchButton({
  hex,
  index,
  isStop,
  filtered,
  onPick,
  onStep,
}: {
  hex: string;
  index: number;
  isStop: boolean;
  filtered: boolean;
  onPick: (hex: string) => void;
  onStep: (event: KeyboardEvent<HTMLElement>, index: number) => void;
}) {
  return (
    <IconButton
      label={hex}
      tooltip={hex}
      icon={<Swatch hex={hex} filtered={filtered} />}
      variant="ghost"
      size="sm"
      tabIndex={isStop ? 0 : -1}
      onClick={() => onPick(hex)}
      onKeyDown={(event) => onStep(event, index)}
    />
  );
}
export function ColourField({ label, value, used, isDisabled, onChange, onClear, canvasFilter = false }: ColourFieldProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [error, setError] = useState(false);
  const [stop, setStop] = useState<number | null>(null);
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
  const content = (
    <VStack gap={2} padding={2}>
      {PALETTE.map((row, r) => (
        <Grid key={row.join()} columns={row.length} gap={0.5}>
          {row.map((hex, c) => {
            const index = PALETTE.slice(0, r).reduce((n, x) => n + x.length, 0) + c;
            return <SwatchButton key={hex} hex={hex} index={index} isStop={index === tabStop} filtered={canvasFilter} onPick={pick} onStep={step} />;
          })}
        </Grid>
      ))}
      {used.length > 0 ? (
        <VStack gap={1}>
          <Text type="supporting">Used on this screen</Text>
          <HStack gap={0.5} wrap="wrap">
            {used.map((hex, c) => {
              const index = PALETTE.flat().length + c;
              return <SwatchButton key={hex} hex={hex} index={index} isStop={index === tabStop} filtered={canvasFilter} onPick={pick} onStep={step} />;
            })}
          </HStack>
        </VStack>
      ) : null}
      {onClear ? (
        <Button
          label="None"
          variant="ghost"
          size="sm"
          icon={<Swatch hex={null} />}
          onClick={() => {
            onClear();
            setOpen(false);
          }}
        />
      ) : null}
      <TextInput
        label="Hex"
        size="sm"
        value={text}
        onChange={(next) => {
          setText(next);
          setError(false);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
        }}
        status={error ? { type: "error", message: "Use a colour like #1A2B3C." } : undefined}
      />
    </VStack>
  );
  return (
    <Popover
      content={content}
      placement="below"
      isOpen={open && !isDisabled}
      onOpenChange={(next) => {
        if (next) {
          setStop(null);
          setText(value ?? "");
          setError(false);
        }
        setOpen(next);
      }}
      isEnabled={!isDisabled}
      label={label}
    >
      {/* The name stays the field label; the current colour is read out as its description. */}
      <Button label={label} aria-description={value ? `Current colour ${value}` : "No colour"} variant="secondary" size="sm" isDisabled={isDisabled} icon={<Swatch hex={value} filtered={canvasFilter} />}>
        {value ?? "None"}
      </Button>
    </Popover>
  );
}
export default ColourField;
