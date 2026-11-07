"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import { TASTE_DENSITY, type TasteBoard as Board, type TasteTile } from "@meld/contracts";
import type { ReactNode } from "react";
import { PixelEdit } from "@/ui/pixel-icons";
import { TASTE_TILE_LABELS } from "../taste/describe-suggestion";

function Tile({ tile, wide, onEdit, children }: { tile: TasteTile; wide?: boolean; onEdit: (tile: TasteTile) => void; children: ReactNode }) {
  return (
    <Card style={{ flexBasis: wide ? "100%" : "calc(50% - var(--spacing-2))", flexGrow: 1 }}>
      <VStack gap={2}>
        <HStack hAlign="between" vAlign="center">
          <Heading level={3}>{TASTE_TILE_LABELS[tile]}</Heading>
          <Button
            label={`Edit ${TASTE_TILE_LABELS[tile]}`}
            isIconOnly
            icon={<Icon icon={PixelEdit} size="sm" />}
            variant="ghost"
            size="sm"
            onClick={() => onEdit(tile)}
          />
        </HStack>
        {children}
      </VStack>
    </Card>
  );
}

function Chips({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <Text type="supporting">{empty}</Text>;
  return (
    <HStack gap={1} wrap="wrap">
      {items.map((item) => (
        <Token key={item} label={item} />
      ))}
    </HStack>
  );
}

export function TasteBoard({ board, onEdit }: { board: Board; onEdit: (tile: TasteTile) => void }) {
  const densityStep = TASTE_DENSITY.indexOf(board.density);
  const boldType = board.typography.weight === "heavy" || board.typography.weight === "bold";
  return (
    <HStack gap={4} wrap="wrap" data-testid="taste-board">
      <Tile tile="designLanguage" wide onEdit={onEdit}>
        <Text type="display-3">{board.designLanguage.join(" · ")}</Text>
      </Tile>
      <Tile tile="colors" onEdit={onEdit}>
        <HStack gap={2} wrap="wrap">
          {board.colors.map((color) => (
            // The hex is data (the owner's colour), not app styling.
            <VStack
              key={color.hex}
              role="img"
              aria-label={`${color.hex} ${color.role}`}
              style={{
                backgroundColor: color.hex,
                blockSize: "var(--spacing-8)",
                inlineSize: "var(--spacing-8)",
                borderRadius: "var(--radius-element)",
                boxShadow: "inset 0 0 0 var(--spacing-0-5) var(--color-border)",
              }}
            />
          ))}
        </HStack>
      </Tile>
      <Tile tile="typography" onEdit={onEdit}>
        <Text type="display-3" weight={boldType ? "bold" : "normal"}>Aa</Text>
        <Text type="supporting">
          {board.typography.weight} weight, {board.typography.tracking} tracking
          {board.typography.note ? ` — ${board.typography.note}` : ""}
        </Text>
      </Tile>
      <Tile tile="spacing" onEdit={onEdit}>
        <Text>{board.spacing}</Text>
      </Tile>
      <Tile tile="density" onEdit={onEdit}>
        <HStack gap={1} role="meter" aria-label={`Density: ${board.density}`} aria-valuemin={0} aria-valuemax={4} aria-valuenow={densityStep}>
          {TASTE_DENSITY.map((step, index) => (
            <VStack
              key={step}
              style={{
                flexGrow: 1,
                blockSize: "var(--spacing-2)",
                borderRadius: "var(--radius-full)",
                backgroundColor: index <= densityStep ? "var(--color-background-inverted)" : "var(--color-background-muted)",
              }}
            />
          ))}
        </HStack>
        <HStack hAlign="between">
          <Text type="supporting">Airy</Text>
          <Text type="supporting">Dense</Text>
        </HStack>
      </Tile>
      <Tile tile="layoutHabits" wide onEdit={onEdit}>
        <Chips items={board.layoutHabits} empty="None yet" />
      </Tile>
      <Tile tile="signatureDetails" wide onEdit={onEdit}>
        <Chips items={board.signatureDetails} empty="None yet" />
      </Tile>
      <Tile tile="avoid" wide onEdit={onEdit}>
        <Chips items={board.avoid.map((item) => item.text)} empty="Nothing yet" />
      </Tile>
    </HStack>
  );
}
