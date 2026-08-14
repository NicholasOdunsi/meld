"use server";
import {
  DesignReferenceSchema,
  type DesignReferenceView,
} from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

const THUMBNAIL_BUCKET = "design-reference-thumbnails";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

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
      const parsed = DesignReferenceSchema.safeParse({
        id: row.id,
        roomId: row.room_id,
        normalizedUrl: row.normalized_url,
        title: row.title,
        oembedStatus: row.oembed_status,
        fetchedAt: row.fetched_at,
        createdAt: row.created_at,
      });
      if (!parsed.success) return [];
      const thumbnailUrl =
        row.oembed_status === "ok" && row.thumbnail_ref
          ? (signedByPath.get(row.thumbnail_ref) ?? null)
          : null;
      return [{ ...parsed.data, thumbnailUrl }];
    });
  } catch (thrown) {
    console.error("listRoomDesignReferences threw", { roomId, thrown });
    return [];
  }
}
