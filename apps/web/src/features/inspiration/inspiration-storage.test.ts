import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createInspirationStorage } from "./inspiration-storage";

function storageClient(overrides: Record<string, unknown> = {}) {
  const bucket = {
    upload: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
    createSignedUrls: vi.fn(async () => ({
      data: [
        { path: "w/a.png", signedUrl: "https://signed/a", error: null },
        { path: "w/b.png", signedUrl: null, error: "missing" },
      ],
      error: null,
    })),
    ...overrides,
  };
  const from = vi.fn(() => bucket);
  return { bucket, from, client: { storage: { from } } as unknown as SupabaseClient };
}

describe("createInspirationStorage", () => {
  it("uploads with upsert so a retried intent can overwrite its own path", async () => {
    const { bucket, from, client } = storageClient();
    await createInspirationStorage(client).upload("w/a.png", new Uint8Array([1]), "image/png");
    expect(from).toHaveBeenCalledWith("inspiration");
    expect(bucket.upload).toHaveBeenCalledWith("w/a.png", new Uint8Array([1]), { contentType: "image/png", upsert: true });
  });

  it("throws when the upload fails", async () => {
    const { client } = storageClient({ upload: vi.fn(async () => ({ error: { message: "boom" } })) });
    await expect(createInspirationStorage(client).upload("w/a.png", new Uint8Array([1]), "image/png")).rejects.toThrow(
      "Inspiration upload failed",
    );
  });

  it("signs a batch and keeps only successful URLs", async () => {
    const { bucket, client } = storageClient();
    const urls = await createInspirationStorage(client).signUrls(["w/a.png", "w/b.png"]);
    expect(bucket.createSignedUrls).toHaveBeenCalledWith(["w/a.png", "w/b.png"], 3600);
    expect([...urls.entries()]).toEqual([["w/a.png", "https://signed/a"]]);
  });

  it("does not call storage for an empty batch", async () => {
    const { bucket, client } = storageClient();
    expect((await createInspirationStorage(client).signUrls([])).size).toBe(0);
    await createInspirationStorage(client).remove([]);
    expect(bucket.createSignedUrls).not.toHaveBeenCalled();
    expect(bucket.remove).not.toHaveBeenCalled();
  });
});
