import type { AttachmentInput } from "./schemas";

type FinalExtractionStatus = "ready" | "unsupported";

export type PersistedAttachmentInput = AttachmentInput & {
  id: string;
  storagePath: string;
  extractionStatus: FinalExtractionStatus;
  extractedText: string | null;
};

type AttachmentRepository = {
  createAttachmentIntent(
    input: PersistedAttachmentInput,
  ): Promise<unknown>;
  finalizeAttachment(
    input: PersistedAttachmentInput,
  ): Promise<Record<string, unknown>>;
  markAttachmentFailed(id: string): Promise<unknown>;
};

type AttachmentStorage = {
  upload(
    path: string,
    bytes: Uint8Array,
    options: { contentType: string; upsert: false },
  ): Promise<{ error: { message: string } | null }>;
};

export async function persistAttachmentUpload({
  attachment,
  bytes,
  repository,
  storage,
}: {
  attachment: PersistedAttachmentInput;
  bytes: Uint8Array;
  repository: AttachmentRepository;
  storage: AttachmentStorage;
}) {
  await repository.createAttachmentIntent(attachment);
  const upload = await storage.upload(attachment.storagePath, bytes, {
    contentType: attachment.mimeType,
    upsert: false,
  });
  if (upload.error) {
    try {
      await repository.markAttachmentFailed(attachment.id);
    } catch {
      throw new Error(
        "We could not upload the attachment; metadata cleanup requires attention.",
      );
    }
    throw new Error("We could not upload the attachment.");
  }

  try {
    return await repository.finalizeAttachment(attachment);
  } catch {
    throw new Error(
      "The attachment was uploaded, but finalization is pending.",
    );
  }
}
