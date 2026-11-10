import { z } from "zod";

// Taste Profile vocabulary. The SQL check constraints in
// supabase/migrations/20261108000001_taste_profile.sql mirror TASTE_TILES and
// TASTE_SIGNAL_REASONS -- change both together.
export const TASTE_TILES = [
  "designLanguage",
  "colors",
  "typography",
  "spacing",
  "density",
  "layoutHabits",
  "signatureDetails",
  "avoid",
] as const;
export type TasteTile = (typeof TASTE_TILES)[number];
export const TASTE_COLOR_ROLES = ["base", "surface", "text", "action", "accent"] as const;
export const TASTE_WEIGHTS = ["light", "regular", "bold", "heavy"] as const;
export const TASTE_TRACKING = ["loose", "normal", "tight"] as const;
export const TASTE_SPACING = ["tight", "comfortable", "generous"] as const;
export const TASTE_DENSITY = ["airy", "light", "balanced", "compact", "dense"] as const;
export const TASTE_AVOID_SOURCES = ["typed", "rejected", "redo"] as const;
export const TASTE_SIGNAL_REASONS = [
  "too_plain",
  "too_busy",
  "wrong_colours",
  "wrong_layout",
  "not_my_style",
] as const;
export type TasteSignalReason = (typeof TASTE_SIGNAL_REASONS)[number];

export const TASTE_LIMITS = {
  designLanguage: { min: 1, max: 4 },
  colors: { min: 1, max: 6 },
  layoutHabits: { min: 0, max: 5 },
  signatureDetails: { min: 0, max: 6 },
  avoid: { min: 0, max: 12 },
} as const;

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();
const plain = (min: number, max: number) =>
  z.string().transform(collapse).pipe(z.string().min(min).max(max));

const DesignWord = z
  .string()
  .transform((value) => collapse(value).toLowerCase())
  .pipe(z.string().min(1).max(24));
const Hex = z.string().trim().toLowerCase().regex(/^#[0-9a-f]{6}$/);
export const TasteColorSchema = z.object({ hex: Hex, role: z.enum(TASTE_COLOR_ROLES) });
export const TasteTypographySchema = z.object({
  weight: z.enum(TASTE_WEIGHTS),
  tracking: z.enum(TASTE_TRACKING),
  note: plain(0, 80),
});
const LayoutHabit = plain(1, 80);
const SignatureDetail = plain(1, 60);
export const TasteAvoidSchema = z.object({ text: plain(1, 80), source: z.enum(TASTE_AVOID_SOURCES) });

const list = <T extends z.ZodTypeAny>(item: T, limits: { min: number; max: number }) =>
  z.array(item).min(limits.min).max(limits.max);

export const TasteBoardSchema = z
  .object({
    designLanguage: list(DesignWord, TASTE_LIMITS.designLanguage),
    colors: list(TasteColorSchema, TASTE_LIMITS.colors),
    typography: TasteTypographySchema,
    spacing: z.enum(TASTE_SPACING),
    density: z.enum(TASTE_DENSITY),
    layoutHabits: list(LayoutHabit, TASTE_LIMITS.layoutHabits),
    signatureDetails: list(SignatureDetail, TASTE_LIMITS.signatureDetails),
    avoid: list(TasteAvoidSchema, TASTE_LIMITS.avoid),
  })
  .strict()
  .refine((board) => new Set(board.colors.map((c) => c.hex)).size === board.colors.length, {
    message: "colours must not repeat",
    path: ["colors"],
  });
export type TasteBoard = z.infer<typeof TasteBoardSchema>;

const listOps = <T extends string, V extends z.ZodTypeAny>(tile: T, value: V) =>
  [
    z.object({ tile: z.literal(tile), op: z.literal("add"), value }),
    z.object({ tile: z.literal(tile), op: z.literal("remove"), value }),
  ] as const;
const setOp = <T extends string, V extends z.ZodTypeAny>(tile: T, value: V) =>
  z.object({ tile: z.literal(tile), op: z.literal("set"), value });

const TASTE_OPERATIONS = [
  ...listOps("designLanguage", DesignWord),
  ...listOps("colors", TasteColorSchema),
  ...listOps("layoutHabits", LayoutHabit),
  ...listOps("signatureDetails", SignatureDetail),
  ...listOps("avoid", TasteAvoidSchema),
  setOp("typography", TasteTypographySchema),
  setOp("spacing", z.enum(TASTE_SPACING)),
  setOp("density", z.enum(TASTE_DENSITY)),
] as const;

export const TasteOperationSchema = z.union(TASTE_OPERATIONS);
export type TasteOperation = z.infer<typeof TasteOperationSchema>;

export const TasteSuggestionSchema = TasteOperationSchema.and(
  z.object({ reason: plain(1, 140), evidenceItemIds: z.array(z.string().uuid()).max(3) }),
);
export type TasteSuggestion = z.infer<typeof TasteSuggestionSchema>;

export const TASTE_CARD_SOURCE_KINDS = ["file", "link", "words", "image", "preset"] as const;
export const TasteCardSourceSchema = z.object({
  kind: z.enum(TASTE_CARD_SOURCE_KINDS),
  name: z.string().max(120),
  locator: z.string().max(120),
});
export type TasteCardSource = z.infer<typeof TasteCardSourceSchema>;
export const TasteComposerCardSchema = TasteOperationSchema.and(
  z.object({ reason: plain(1, 140), source: TasteCardSourceSchema }),
);
export type TasteComposerCard = z.infer<typeof TasteComposerCardSchema>;

export const TasteFirstBoardResponseSchema = z.object({ board: TasteBoardSchema }).strict();
export const TasteSuggestionsResponseSchema = z
  .object({ suggestions: z.array(TasteSuggestionSchema).max(5) })
  .strict();

const norm = (value: string) => collapse(value).toLowerCase();

/** One item's identity inside a tile, ignoring case/spacing (and colour role). */
export function tasteItemKey(tile: TasteTile, value: unknown): string {
  switch (tile) {
    case "colors":
      return String((value as { hex: string }).hex).toLowerCase();
    case "avoid":
      return norm((value as { text: string }).text);
    case "typography": {
      const type = value as z.infer<typeof TasteTypographySchema>;
      return `${type.weight}/${type.tracking}/${norm(type.note)}`;
    }
    default:
      return norm(String(value));
  }
}

/** Stable identity of an operation, used for the "ever rejected" check. */
export function tasteValueKey(op: TasteOperation): string {
  return `${op.tile}:${op.op}:${tasteItemKey(op.tile, op.value)}`;
}

/**
 * Applies one operation and re-validates the board. Returns null when the
 * operation is a no-op, targets a missing item, or would break a tile limit.
 */
export function applyTasteOperation(board: TasteBoard, op: TasteOperation): TasteBoard | null {
  const key = (value: unknown) => tasteItemKey(op.tile, value);
  let next: unknown;
  if (op.op === "set") {
    if (key(board[op.tile]) === key(op.value)) return null;
    next = { ...board, [op.tile]: op.value };
  } else {
    const items = board[op.tile] as unknown[];
    const exists = items.some((item) => key(item) === key(op.value));
    if (op.op === "add") {
      if (exists) return null;
      next = { ...board, [op.tile]: [...items, op.value] };
    } else {
      if (!exists) return null;
      next = { ...board, [op.tile]: items.filter((item) => key(item) !== key(op.value)) };
    }
  }
  const parsed = TasteBoardSchema.safeParse(next);
  return parsed.success ? parsed.data : null;
}

export const ShelfTasteSuggestionSchema = z.object({
  id: z.string().uuid(),
  tile: z.enum(TASTE_TILES),
  op: z.enum(["add", "remove", "set"]),
  value: z.unknown(),
  reason: z.string(),
  evidenceItemIds: z.array(z.string().uuid()),
});
export type ShelfTasteSuggestion = z.infer<typeof ShelfTasteSuggestionSchema>;

export const ShelfTasteSnapshotSchema = z.object({
  board: TasteBoardSchema,
  version: z.number().int().min(0),
  appleRules: z.boolean(),
  pending: z.array(ShelfTasteSuggestionSchema),
});
export type ShelfTasteSnapshot = z.infer<typeof ShelfTasteSnapshotSchema>;

export const ShelfTasteTileRequestSchema = z
  .object({ tile: z.enum(TASTE_TILES), value: z.unknown(), expectedVersion: z.number().int().min(0) })
  .strict();
export const ShelfTasteDecisionRequestSchema = z
  .object({ decision: z.enum(["kept", "rejected"]), expectedVersion: z.number().int().min(0) })
  .strict();
export const ShelfAppleRulesRequestSchema = z.object({ enabled: z.boolean() }).strict();
export const ShelfTasteResetRequestSchema = z.object({ tile: z.enum(TASTE_TILES) }).strict();
