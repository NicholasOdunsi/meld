"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { extractAttachmentText } from "@/features/rooms/attachment-extractor";

const UploadInput = z
  .object({
    roomId: z.string().uuid(),
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.string(),
    bytes: z.instanceof(Uint8Array),
  })
  .strict();

export type UploadDesignSystemDocumentResult =
  | { status: "queued"; taskId: string }
  | { status: "error"; message: string };

const UPLOAD_ERROR = "We could not start design-system distillation.";
const TaskRow = z.object({ id: z.string().uuid() }).passthrough();

export async function uploadDesignSystemDocument(
  input: z.input<typeof UploadInput>,
): Promise<UploadDesignSystemDocumentResult> {
  const parsed = UploadInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: UPLOAD_ERROR };

  let extractedText: string | null;
  try {
    extractedText = await extractAttachmentText({
      mimeType: parsed.data.mimeType,
      bytes: parsed.data.bytes,
    });
  } catch (thrown) {
    return {
      status: "error",
      message: thrown instanceof Error ? thrown.message : UPLOAD_ERROR,
    };
  }
  if (!extractedText) {
    return { status: "error", message: "That file has no readable text." };
  }

  try {
    if (isRoomFakeEnabled()) {
      const { fakeUploadDesignSystemDocument } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeUploadDesignSystemDocument({
        roomId: parsed.data.roomId,
        fileName: parsed.data.fileName,
        extractedText,
      });
    }
    const supabase = await createClient(new Headers());
    const roomResult = await supabase
      .from("rooms")
      .select("workspace_id")
      .eq("id", parsed.data.roomId)
      .maybeSingle();
    const room = z
      .object({ workspace_id: z.string().uuid() })
      .strict()
      .safeParse(roomResult.data);
    if (!room.success) return { status: "error", message: UPLOAD_ERROR };

    const objectPath = `${room.data.workspace_id}/${randomUUID()}-${parsed.data.fileName}`;
    const uploadResult = await supabase.storage
      .from("design-system")
      .upload(objectPath, parsed.data.bytes, { contentType: parsed.data.mimeType });
    if (uploadResult.error) return { status: "error", message: UPLOAD_ERROR };

    const { data, error } = await supabase.rpc("create_design_profile_distill_task", {
      target_room_id: parsed.data.roomId,
      target_provider: null,
      source_object_path: objectPath,
      source_extracted_text: extractedText,
      source_file_name: parsed.data.fileName,
    });
    const task = TaskRow.safeParse(data);
    if (error || !task.success) return { status: "error", message: UPLOAD_ERROR };
    return { status: "queued", taskId: task.data.id };
  } catch {
    return { status: "error", message: UPLOAD_ERROR };
  }
}

const DistillationRow = z
  .object({
    task_id: z.string().uuid(),
    version_id: z.string().uuid().nullable(),
    is_active: z.boolean().nullable(),
  })
  .strict();
export type DesignProfileDistillation = {
  taskId: string;
  versionId: string | null;
  isActive: boolean | null;
};

function asRows(data: unknown): unknown[] {
  return Array.isArray(data) ? data : data ? [data] : [];
}

export async function getDesignProfileDistillation(
  taskId: string,
): Promise<DesignProfileDistillation | null> {
  const id = z.string().uuid().safeParse(taskId);
  if (!id.success) return null;
  try {
    if (isRoomFakeEnabled()) {
      const { fakeGetDesignProfileDistillation } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeGetDesignProfileDistillation(id.data);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("get_design_profile_distillation", {
      target_task_id: id.data,
    });
    if (error) return null;
    const rows = z.array(DistillationRow).safeParse(asRows(data));
    if (!rows.success) return null;
    const row = rows.data[0];
    return row
      ? { taskId: row.task_id, versionId: row.version_id, isActive: row.is_active }
      : null;
  } catch {
    return null;
  }
}
