"use server";
import {
  DesignReferenceSchema,
  type DesignReferenceView,
} from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

export const THUMBNAIL_BUCKET = "design-reference-thumbnails";
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

const ReferenceRow = z
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

export async function listRoomDesignReferences(
  roomId: string,
): Promise<DesignReferenceView[]> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return [];
  try {
    if (isRoomFakeEnabled()) {
      const { fakeListRoomDesignReferences } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeListRoomDesignReferences(id.data);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase
      .from("design_references")
      .select(
        "id,room_id,normalized_url,title,thumbnail_ref,oembed_status,fetched_at,created_at",
      )
      .eq("room_id", id.data)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("listRoomDesignReferences error", { roomId, error });
      return [];
    }
    const rows = z.array(ReferenceRow).safeParse(data ?? []);
    if (!rows.success) return [];

    // Batch-sign every "ok" row's thumbnail_ref in one round-trip; the
    // storage path itself never leaves this function -- only the signed
    // URL below does.
    const signedByPath = new Map<string, string | null>();
    const thumbnailPaths = rows.data
      .filter((row) => row.oembed_status === "ok" && row.thumbnail_ref)
      .map((row) => row.thumbnail_ref as string);
    if (thumbnailPaths.length > 0) {
      const signed = await supabase.storage
        .from(THUMBNAIL_BUCKET)
        .createSignedUrls(thumbnailPaths, SIGNED_URL_TTL_SECONDS);
      for (const entry of signed.data ?? []) {
        if (entry.path) {
          signedByPath.set(entry.path, entry.signedUrl ?? null);
        }
      }
    }

    return rows.data.flatMap((row) => {
      const thumbnailUrl =
        row.oembed_status === "ok" && row.thumbnail_ref
          ? (signedByPath.get(row.thumbnail_ref) ?? null)
          : null;
      const view = toReferenceView(row, { thumbnailUrl });
      return view ? [view] : [];
    });
  } catch (thrown) {
    console.error("listRoomDesignReferences threw", { roomId, thrown });
    return [];
  }
}
