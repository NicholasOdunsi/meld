import type { SupabaseClient } from "@supabase/supabase-js";
import { INSPIRATION_BUCKET, SIGNED_URL_TTL_SECONDS } from "./inspiration-shared";

export interface InspirationStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  signUrls(paths: string[]): Promise<Map<string, string>>;
}

export function createInspirationStorage(client: SupabaseClient): InspirationStorage {
  const bucket = () => client.storage.from(INSPIRATION_BUCKET);
  return {
    async upload(path, bytes, contentType) {
      // upsert: a retried intent reuses its row and path (see inspiration_intent_for).
      const { error } = await bucket().upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error("Inspiration upload failed");
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(paths);
      if (error) throw new Error("Inspiration removal failed");
    },
    async signUrls(paths) {
      const urls = new Map<string, string>();
      if (paths.length === 0) return urls;
      const { data } = await bucket().createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
      }
      return urls;
    },
  };
}
