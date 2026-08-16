import { z } from "zod";

// A reference's oEmbed fetch lifecycle: queued, resolved with a thumbnail, or
// permanently failed. Order is load-bearing: the SQL `design_references`
// table's `oembed_status` column defaults to and only ever holds one of
// these three values.
export const OEmbedStatusSchema = z.enum(["pending", "ok", "failed"]);
export type OEmbedStatus = z.infer<typeof OEmbedStatusSchema>;

export const DesignReferenceSchema = z
  .object({
    id: z.string().uuid(),
    roomId: z.string().uuid(),
    normalizedUrl: z.string(),
    title: z.string().nullable(),
    oembedStatus: OEmbedStatusSchema,
    fetchedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type DesignReference = z.infer<typeof DesignReferenceSchema>;

// The reader-side view: adds the signed thumbnail URL minted from the
// private `design-reference-thumbnails` bucket. The underlying
// `thumbnail_ref` storage path never leaves the server -- only this
// short-lived signed URL does.
export type DesignReferenceView = DesignReference & {
  thumbnailUrl: string | null;
};
