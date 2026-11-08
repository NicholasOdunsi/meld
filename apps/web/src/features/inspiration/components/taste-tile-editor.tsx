"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import {
  TASTE_DENSITY,
  TASTE_SPACING,
  TASTE_TRACKING,
  TASTE_WEIGHTS,
  type TasteBoard,
  type TasteTile,
} from "@meld/contracts";
import { useState } from "react";
import { TASTE_TILE_LABELS } from "../taste/describe-suggestion";

const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

function initialText(tile: TasteTile, board: TasteBoard): string {
  switch (tile) {
    case "colors":
      return board.colors.map((c) => `${c.hex} ${c.role}`).join("\n");
    case "avoid":
      return board.avoid.map((a) => a.text).join("\n");
    case "designLanguage":
    case "layoutHabits":
    case "signatureDetails":
      return board[tile].join("\n");
    default:
      return "";
  }
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <SegmentedControl label={label} value={value} onChange={(v) => onChange(v as T)}>
      {options.map((option) => (
        <SegmentedControlItem key={option} value={option} label={option} />
      ))}
    </SegmentedControl>
  );
}

export function TasteTileEditor({
  tile,
  board,
  isOpen,
  onOpenChange,
  onSave,
}: {
  tile: TasteTile;
  board: TasteBoard;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (value: unknown) => void;
}) {
  const [text, setText] = useState(() => initialText(tile, board));
  const [spacing, setSpacing] = useState(board.spacing);
  const [density, setDensity] = useState(board.density);
  const [weight, setWeight] = useState(board.typography.weight);
  const [tracking, setTracking] = useState(board.typography.tracking);
  const [note, setNote] = useState(board.typography.note);
  const label = TASTE_TILE_LABELS[tile];

  function value(): unknown {
    switch (tile) {
      case "spacing":
        return spacing;
      case "density":
        return density;
      case "typography":
        return { weight, tracking, note };
      case "colors":
        return lines(text).map((line) => {
          const [hex, role] = line.split(/\s+/);
          return { hex, role };
        });
      case "avoid":
        return lines(text).map((entry) => ({
          text: entry,
          source: board.avoid.find((a) => a.text === entry)?.source ?? "typed",
        }));
      default:
        return lines(text);
    }
  }

  const body =
    tile === "spacing" ? (
      <Choice label={label} value={spacing} options={TASTE_SPACING} onChange={setSpacing} />
    ) : tile === "density" ? (
      <Choice label={label} value={density} options={TASTE_DENSITY} onChange={setDensity} />
    ) : tile === "typography" ? (
      <VStack gap={3}>
        <Choice label="Weight" value={weight} options={TASTE_WEIGHTS} onChange={setWeight} />
        <Choice label="Tracking" value={tracking} options={TASTE_TRACKING} onChange={setTracking} />
        <TextInput label="Note" value={note} onChange={setNote} />
      </VStack>
    ) : (
      <TextArea
        label={tile === "colors" ? `${label} (one per line: #hex role)` : `${label} (one per line)`}
        value={text}
        onChange={setText}
      />
    );

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width="calc(var(--spacing-10) * 9)">
      <Layout
        height="auto"
        header={
          <DialogHeader
            title={`Edit ${label}`}
            subtitle="Your words win. Orion won't suggest changes here until you've saved 5 more images."
            onOpenChange={onOpenChange}
          />
        }
        content={
          <LayoutContent>
            <VStack padding={4}>{body}</VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} hAlign="end" padding={4}>
              <Button label="Cancel" onClick={() => onOpenChange(false)} />
              <Button label="Save" variant="primary" onClick={() => onSave(value())} />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
