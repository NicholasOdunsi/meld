import { DesignReferenceSchema, type DesignReferenceView } from "@meld/contracts";
import { z } from "zod";

// Pure constants + the row -> view mapper shared between the reader (a "use
// server" module, whose top-level exports must all be async functions --
// Next.js rejects a value or sync-function export there) and the actions
// module. Keeping them here, outside any "use server" file, is what lets
// both re-use the exact same bucket id / TTL / row shape without either one
// tripping that constraint.
export const THUMBNAIL_BUCKET = "design-reference-thumbnails";
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const ReferenceRow = z
  .object({
    id: z.string().uuid(),
    room_id: z.string().uuid(),
    normalized_url: z.string(),
    title: z.string().nullable(),
    thumbnail_ref: z.string().nullable(),
    oembed_status: z.string(),
    fetched_at: z.string().nullable(),
    created_at: z.string(),
  })
  .passthrough();

// The shared row → DesignReferenceView assembly: validates + maps snake_case
// DB columns to the camelCase contract shape. Deliberately a PURE mapper --
// it takes an already-resolved thumbnailUrl rather than signing itself, so
// callers control how (and how many times) they hit storage. The batch
// reader signs once for the whole list via createSignedUrls; the single-row
// action signs once for its one path. Used by both listRoomDesignReferences
// and refreshDesignReference so the two never drift on shape.
export function toReferenceView(
  row: unknown,
  { thumbnailUrl }: { thumbnailUrl: string | null },
): DesignReferenceView | null {
  const parsedRow = ReferenceRow.safeParse(row);
  if (!parsedRow.success) return null;
  const r = parsedRow.data;
  const parsed = DesignReferenceSchema.safeParse({
    id: r.id,
    roomId: r.room_id,
    normalizedUrl: r.normalized_url,
    title: r.title,
    oembedStatus: r.oembed_status,
    fetchedAt: r.fetched_at,
    createdAt: r.created_at,
  });
  if (!parsed.success) return null;
  return { ...parsed.data, thumbnailUrl };
}
