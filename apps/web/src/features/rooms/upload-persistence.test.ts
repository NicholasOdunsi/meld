import { describe, expect, it, vi } from "vitest";
import { persistAttachmentUpload } from "./upload-persistence";
import type { PersistedAttachmentInput } from "./upload-persistence";

const attachment = {
  id: "30000000-0000-4000-8000-000000000003",
  roomId: "10000000-0000-4000-8000-000000000001",
  messageId: undefined,
  caption: undefined,
  fileName: "research.txt",
  mimeType: "text/plain",
  size: 8,
  storagePath:
    "10000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000003/research.txt",
  extractionStatus: "ready" as const,
  extractedText: "Research",
} satisfies PersistedAttachmentInput;

describe("persistAttachmentUpload", () => {
  it("creates a durable pending record before upload and finalizes it", async () => {
    const order: string[] = [];
    const repository = {
      createAttachmentIntent: vi.fn(async () => {
        order.push("intent");
      }),
      finalizeAttachment: vi.fn(async () => {
        order.push("finalize");
        return {
          id: attachment.id,
          original_name: attachment.fileName,
          extraction_status: "ready",
        };
      }),
      markAttachmentFailed: vi.fn(),
    };
    const storage = {
      upload: vi.fn(async () => {
        order.push("upload");
        return { error: null };
      }),
    };

    await expect(
      persistAttachmentUpload({
        attachment,
        bytes: new Uint8Array([1]),
        repository,
        storage,
      }),
    ).resolves.toMatchObject({ id: attachment.id });
    expect(order).toEqual(["intent", "upload", "finalize"]);
  });

  it("leaves an observable pending record if post-upload finalization fails", async () => {
    const repository = {
      createAttachmentIntent: vi.fn().mockResolvedValue(undefined),
      finalizeAttachment: vi
        .fn()
        .mockRejectedValue(new Error("metadata unavailable")),
      markAttachmentFailed: vi.fn(),
    };
    const storage = {
      upload: vi.fn().mockResolvedValue({ error: null }),
    };

    await expect(
      persistAttachmentUpload({
        attachment,
        bytes: new Uint8Array([1]),
        repository,
        storage,
      }),
    ).rejects.toThrow("uploaded, but finalization is pending");
    expect(repository.markAttachmentFailed).not.toHaveBeenCalled();
  });

  it("durably marks the intent failed when storage upload fails", async () => {
    const repository = {
      createAttachmentIntent: vi.fn().mockResolvedValue(undefined),
      finalizeAttachment: vi.fn(),
      markAttachmentFailed: vi.fn().mockResolvedValue(undefined),
    };
    const storage = {
      upload: vi
        .fn()
        .mockResolvedValue({ error: { message: "storage unavailable" } }),
    };

    await expect(
      persistAttachmentUpload({
        attachment,
        bytes: new Uint8Array([1]),
        repository,
        storage,
      }),
    ).rejects.toThrow("could not upload");
    expect(repository.markAttachmentFailed).toHaveBeenCalledWith(
      attachment.id,
    );
    expect(repository.finalizeAttachment).not.toHaveBeenCalled();
  });

  it("records why storage refused, so the cause is not lost with the attempt", async () => {
    // The user-facing message is deliberately generic, so the provider's own
    // reason has to reach the server log or a failed upload is undiagnosable:
    // the attachment row just says "failed" and nothing anywhere says why.
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const repository = {
      createAttachmentIntent: vi.fn().mockResolvedValue(undefined),
      finalizeAttachment: vi.fn(),
      markAttachmentFailed: vi.fn().mockResolvedValue(undefined),
    };
    const storage = {
      upload: vi.fn().mockResolvedValue({
        error: { message: "mime type application/pdf is not supported" },
      }),
    };

    await expect(
      persistAttachmentUpload({
        attachment,
        bytes: new Uint8Array([1]),
        repository,
        storage,
      }),
    ).rejects.toThrow("could not upload");

    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).toContain("mime type application/pdf is not supported");
    expect(logged).toContain(attachment.id);
    expect(logged).toContain(attachment.storagePath);
    consoleError.mockRestore();
  });

  it("surfaces a cleanup alert if even the durable failure update fails", async () => {
    const repository = {
      createAttachmentIntent: vi.fn().mockResolvedValue(undefined),
      finalizeAttachment: vi.fn(),
      markAttachmentFailed: vi
        .fn()
        .mockRejectedValue(new Error("database unavailable")),
    };
    const storage = {
      upload: vi
        .fn()
        .mockResolvedValue({ error: { message: "storage unavailable" } }),
    };

    await expect(
      persistAttachmentUpload({
        attachment,
        bytes: new Uint8Array([1]),
        repository,
        storage,
      }),
    ).rejects.toThrow("cleanup requires attention");
  });
});
