import { z } from "zod";

// Single source of truth for every inspiration limit. The Swift shelf keeps a
// hand-copied mirror in apps/mac/Sources/ShelfCore/Limits.swift -- change
// both together.
export const INSPIRATION_LIMITS = {
  maxBytes: 10_485_760,
  maxEdge: 4096,
  fallbackEdge: 2048,
  noteMax: 500,
  sourceUrlMax: 2048,
  pageSize: 60,
  shelfLibraryPageSize: 100,
  bulkMax: 100,
  deviceNameMax: 100,
} as const;

export const InspirationMimeTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);
export type InspirationMimeType = z.infer<typeof InspirationMimeTypeSchema>;

export const CaptureChannelSchema = z.enum(["shelf", "web"]);
export type CaptureChannel = z.infer<typeof CaptureChannelSchema>;

export function normalizeSourceUrl(input: string | null | undefined): string | null {
  const trimmed = input?.trim() ?? "";
  if (trimmed === "" || trimmed.length > INSPIRATION_LIMITS.sourceUrlMax) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

// Notes are a convenience, so an over-long one is cut rather than failing the save.
export function normalizeNote(input: string | null | undefined): string | null {
  const trimmed = input?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, INSPIRATION_LIMITS.noteMax);
}

export const InspirationItemViewSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    imageUrl: z.string().nullable(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    mimeType: InspirationMimeTypeSchema,
    sourceUrl: z.string().nullable(),
    note: z.string().nullable(),
    captureChannel: CaptureChannelSchema,
    createdAt: z.string(),
    roomIds: z.array(z.string().uuid()),
  })
  .strict();
export type InspirationItemView = z.infer<typeof InspirationItemViewSchema>;

export const ShelfConnectRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(32),
    deviceName: z.string().trim().min(1).max(INSPIRATION_LIMITS.deviceNameMax),
  })
  .strict();

export const ShelfConnectResponseSchema = z
  .object({ token: z.string(), workspaceId: z.string().uuid(), workspaceName: z.string() })
  .strict();
export type ShelfConnectResponse = z.infer<typeof ShelfConnectResponseSchema>;

export const ShelfRoomSchema = z
  .object({ roomId: z.string().uuid(), roomName: z.string(), projectName: z.string() })
  .strict();
export type ShelfRoom = z.infer<typeof ShelfRoomSchema>;

export const ShelfUploadFieldsSchema = z.object({
  note: z.string().nullish().transform(normalizeNote),
  sourceUrl: z.string().nullish().transform(normalizeSourceUrl),
  roomId: z.string().uuid().nullish().transform((value) => value ?? null),
});
export type ShelfUploadFields = z.infer<typeof ShelfUploadFieldsSchema>;

export const ShelfUploadResponseSchema = z
  .object({ itemId: z.string().uuid(), duplicate: z.boolean(), roomLinked: z.boolean() })
  .strict();
export type ShelfUploadResponse = z.infer<typeof ShelfUploadResponseSchema>;

// Native Inspiration screen (spec 2026-11-09-native-inspiration-design.md).
export const ShelfLabelStateSchema = z.enum(["pending", "done", "skipped"]);
export type ShelfLabelState = z.infer<typeof ShelfLabelStateSchema>;

export const ShelfLibraryItemSchema = z
  .object({
    id: z.string().uuid(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    mimeType: InspirationMimeTypeSchema,
    note: z.string().nullable(),
    sourceUrl: z.string().nullable(),
    createdAt: z.string(),
    description: z.string().nullable(),
    labelState: ShelfLabelStateSchema,
    rooms: z.array(ShelfRoomSchema),
    imageUrl: z.string().nullable(),
  })
  .strict();
export type ShelfLibraryItem = z.infer<typeof ShelfLibraryItemSchema>;

export const ShelfLibraryPageSchema = z
  .object({ items: z.array(ShelfLibraryItemSchema), nextOffset: z.number().int().min(0).nullable() })
  .strict();
export type ShelfLibraryPage = z.infer<typeof ShelfLibraryPageSchema>;

export const ShelfNoteRequestSchema = z
  .object({ note: z.string().max(INSPIRATION_LIMITS.noteMax).nullable() })
  .strict();

const ShelfItemIds = z.array(z.string().uuid()).min(1).max(INSPIRATION_LIMITS.bulkMax);
export const ShelfItemIdsRequestSchema = z.object({ ids: ShelfItemIds }).strict();
export const ShelfAddToRoomRequestSchema = z.object({ ids: ShelfItemIds, roomId: z.string().uuid() }).strict();

export const ShelfCountResponseSchema = z.object({ count: z.number().int().min(0) }).strict();
export type ShelfCountResponse = z.infer<typeof ShelfCountResponseSchema>;

export const ShelfErrorCodeSchema = z.enum([
  "unauthorized",
  "invalid_code",
  "rate_limited",
  "unsupported_type",
  "too_large",
  "invalid_image",
  "invalid_request",
  "not_found",
  "unavailable",
]);
export type ShelfErrorCode = z.infer<typeof ShelfErrorCodeSchema>;

export const ShelfErrorSchema = z
  .object({ error: z.object({ code: ShelfErrorCodeSchema, message: z.string() }).strict() })
  .strict();
export type ShelfErrorBody = z.infer<typeof ShelfErrorSchema>;

export const SHELF_ERROR_MESSAGES: Record<ShelfErrorCode, string> = {
  unauthorized: "Reconnect the shelf in Orion Settings → Shelf.",
  invalid_code: "That code didn't work. Make a new one in Orion Settings → Shelf.",
  rate_limited: "Too many tries. Wait a few minutes and try again.",
  unsupported_type: "Only images can be saved.",
  too_large: "Too large to save.",
  invalid_image: "That file isn't a readable image.",
  invalid_request: "Orion couldn't do that. Try again.",
  not_found: "That image is no longer in Inspiration.",
  unavailable: "Orion couldn't save that right now. It will try again.",
};
