import {
  CaptureChannelSchema,
  InspirationItemViewSchema,
  InspirationMimeTypeSchema,
  type InspirationItemView,
} from "@meld/contracts";
import { z } from "zod";
import type { InspirationStorage } from "./inspiration-storage";

// Pure constants + the row -> view mapper, kept outside the "use server"
// modules (which may only export async functions) so readers, actions, and
// routes share one definition.
export const INSPIRATION_BUCKET = "inspiration";
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const INSPIRATION_ITEM_COLUMNS =
  "id,workspace_id,status,storage_path,mime_type,width,height,source_url,note,capture_channel,created_at";

export const InspirationItemRowSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    status: z.enum(["pending", "ready", "failed"]),
    storage_path: z.string(),
    mime_type: InspirationMimeTypeSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    source_url: z.string().nullable(),
    note: z.string().nullable(),
    capture_channel: CaptureChannelSchema,
    created_at: z.string(),
  })
  .passthrough();
export type InspirationItemRow = z.infer<typeof InspirationItemRowSchema>;

export type ShelfTokenView = {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const EmbeddedLinksSchema = z.array(z.object({ room_id: z.string().uuid() })).catch([]);

function toItemView(
  r: InspirationItemRow,
  imageUrl: string | null,
  roomIds: string[],
): InspirationItemView | null {
  const parsed = InspirationItemViewSchema.safeParse({
    id: r.id,
    workspaceId: r.workspace_id,
    imageUrl,
    width: r.width,
    height: r.height,
    mimeType: r.mime_type,
    sourceUrl: r.source_url,
    note: r.note,
    captureChannel: r.capture_channel,
    createdAt: r.created_at,
    roomIds,
  });
  return parsed.success ? parsed.data : null;
}

// Rows carry an embedded `room_inspiration(room_id)` list. All storage paths
// are signed in one call rather than one call per tile.
export async function toViews(rows: unknown[], storage: InspirationStorage): Promise<InspirationItemView[]> {
  const parsed = rows.flatMap((row) => {
    const result = InspirationItemRowSchema.safeParse(row);
    if (!result.success) return [];
    const links = EmbeddedLinksSchema.parse((row as { room_inspiration?: unknown }).room_inspiration ?? []);
    return [{ row: result.data, roomIds: links.map((link) => link.room_id) }];
  });
  const urls = await storage.signUrls(parsed.map(({ row }) => row.storage_path));
  return parsed.flatMap(({ row, roomIds }) => {
    const view = toItemView(row, urls.get(row.storage_path) ?? null, roomIds);
    return view ? [view] : [];
  });
}
