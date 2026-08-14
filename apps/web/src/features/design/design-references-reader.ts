"use server";
import {
  DesignReferenceSchema,
  type DesignReferenceView,
} from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

export const THUMBNAIL_BUCKET = "design-reference-thumbnails";
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

// The type actions and the reader both need for the storage client: only the
// two calls this module ever makes against it.
type SigningClient = {
  storage: {
    from(bucket: string): {
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): Promise<{ data: { signedUrl: string | null } | null; error: unknown }>;
    };
  };
};

// The shared row → DesignReferenceView assembly: validates + maps snake_case
// DB columns to the camelCase contract shape, and signs thumbnail_ref into a
// short-lived thumbnailUrl for an "ok" row (never leaking the storage path
// itself). Used by both listRoomDesignReferences (the batch reader) and
// refreshDesignReference (the single-row action) so the two never drift.
export async function toReferenceView(
  row: unknown,
  supabase: SigningClient,
): Promise<DesignReferenceView | null> {
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

  let thumbnailUrl: string | null = null;
  if (r.oembed_status === "ok" && r.thumbnail_ref) {
    const signed = await supabase.storage
      .from(THUMBNAIL_BUCKET)
      .createSignedUrl(r.thumbnail_ref, SIGNED_URL_TTL_SECONDS);
    thumbnailUrl = signed.data?.signedUrl ?? null;
  }
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

    const views = await Promise.all(
      rows.data.map((row) => toReferenceView(row, supabase)),
    );
    return views.filter((view): view is DesignReferenceView => view !== null);
  } catch (thrown) {
    console.error("listRoomDesignReferences threw", { roomId, thrown });
    return [];
  }
}
