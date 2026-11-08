import type { TasteBoard, TasteOperation, TasteTile } from "@meld/contracts";

export const TASTE_TILE_LABELS: Record<TasteTile, string> = {
  designLanguage: "Design language",
  colors: "Colour",
  typography: "Typography",
  spacing: "Spacing",
  density: "Density",
  layoutHabits: "Layout habits",
  signatureDetails: "Signature details",
  avoid: "You avoid",
};

function label(tile: TasteTile, value: unknown): string {
  if (tile === "colors") {
    const color = value as { hex: string; role: string };
    return `${color.hex} (${color.role})`;
  }
  if (tile === "avoid") return (value as { text: string }).text;
  if (tile === "typography") {
    const type = value as { weight: string; tracking: string };
    return `${type.weight}, ${type.tracking} tracking`;
  }
  return String(value);
}

export function tasteValueLabel(op: TasteOperation): string {
  return label(op.tile, op.value);
}

/** The card headline. Built by Meld from the operation -- never AI-written. */
export function describeSuggestion(op: TasteOperation, board: TasteBoard): string {
  const tileLabel = TASTE_TILE_LABELS[op.tile];
  const value = label(op.tile, op.value);
  if (op.op === "set") return `${tileLabel}: ${label(op.tile, board[op.tile])} → ${value}`;
  if (op.tile === "avoid") {
    return op.op === "add" ? `You seem to avoid “${value}”` : `Stop avoiding “${value}”`;
  }
  if (op.tile === "colors") {
    return op.op === "add" ? `Add ${value} to ${tileLabel}` : `Remove ${value} from ${tileLabel}`;
  }
  return op.op === "add" ? `Add “${value}” to ${tileLabel}` : `Remove “${value}” from ${tileLabel}`;
}
