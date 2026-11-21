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
};
// A swatch shows the user's own colour, so its fill is the one literal value allowed here.
function Swatch({ hex }: { hex: string | null }) {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden>
      {hex ? (
        <circle cx="8" cy="8" r="6.5" fill={hex} stroke="var(--color-border-emphasized)" />
      ) : (
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="var(--color-border-emphasized)" strokeDasharray="2 2" />
      )}
    </svg>
  );
}
const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
// Arrow keys step through the swatches in reading order (left/up = previous, right/down = next).
function stepSwatch(event: KeyboardEvent<HTMLElement>) {
  if (!ARROWS.includes(event.key)) return;
  const swatches = [...(event.currentTarget.closest("[role=dialog], [popover]")?.querySelectorAll<HTMLElement>("button[aria-label^='#']") ?? [])];
  const at = swatches.indexOf(event.currentTarget);
  const next = swatches[at + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}
function SwatchButton({ hex, onPick }: { hex: string; onPick: (hex: string) => void }) {
  return <IconButton label={hex} tooltip={hex} icon={<Swatch hex={hex} />} variant="ghost" size="sm" onClick={() => onPick(hex)} onKeyDown={stepSwatch} />;
}
export function ColourField({ label, value, used, isDisabled, onChange, onClear }: ColourFieldProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ?? "");
  const [error, setError] = useState(false);
  function pick(hex: string) {
    onChange(hex);
    setOpen(false);
  }
  function commit() {
    if (text.trim() === "" || normaliseHex(text) === value) {
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
      {PALETTE.map((row) => (
        <Grid key={row.join()} columns={row.length} gap={0.5}>
          {row.map((hex) => (
            <SwatchButton key={hex} hex={hex} onPick={pick} />
          ))}
        </Grid>
      ))}
      {used.length > 0 ? (
        <VStack gap={1}>
          <Text type="supporting">Used on this screen</Text>
          <HStack gap={0.5} wrap="wrap">
            {used.map((hex) => (
              <SwatchButton key={hex} hex={hex} onPick={pick} />
            ))}
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
          setText(value ?? "");
          setError(false);
        }
        setOpen(next);
      }}
      isEnabled={!isDisabled}
      label={label}
    >
      <Button label={label} variant="secondary" size="sm" isDisabled={isDisabled} icon={<Swatch hex={value} />}>
        {value ?? "None"}
      </Button>
    </Popover>
  );
}
export default ColourField;
