"use server";
import { z } from "zod";
import type { DesignReferenceView } from "@meld/contracts";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { extractFigmaReferences } from "@/features/design/figma-url";
import { downloadCappedImage, fetchFigmaOEmbed } from "@/features/design/figma-oembed";
import {
  SIGNED_URL_TTL_SECONDS,
  THUMBNAIL_BUCKET,
  toReferenceView,
} from "@/features/design/design-references-shared";

const RecordInput = z
  .object({ roomId: z.string().uuid(), body: z.string() })
  .strict();

// Best-effort Figma-link unfurl, called fire-and-forget from postMessage.
// Every failure mode -- a bad input, one URL's RPC erroring or throwing, the
// client itself failing to construct -- is caught here so the caller never
// sees a rejection and the human message post is never put at risk.
export async function recordFigmaReferences(
  input: z.input<typeof RecordInput>,
): Promise<void> {
  try {
    const parsed = RecordInput.safeParse(input);
    if (!parsed.success) return;
    const urls = extractFigmaReferences(parsed.data.body);
    if (urls.length === 0) return;

    if (isRoomFakeEnabled()) {
      const { fakeRecordFigmaReferences } = await import(
        "@/features/rooms/e2e-fake"
      );
      await fakeRecordFigmaReferences(parsed.data.roomId, parsed.data.body);
      return;
    }

    const supabase = await createClient(new Headers());
    // Per-URL loop: one URL's RPC failure must never abort the rest.
    for (const url of urls) {
      try {
        const { error } = await supabase.rpc("add_design_reference", {
          target_room_id: parsed.data.roomId,
          url,
          ref_title: null,
          thumb: null,
          status: "pending",
        });
        if (error) {
          console.error("recordFigmaReferences RPC error", {
            roomId: parsed.data.roomId,
            url,
            error,
          });
        }
      } catch (thrown) {
        console.error("recordFigmaReferences RPC threw", {
          roomId: parsed.data.roomId,
          url,
          thrown,
        });
      }
    }
  } catch (thrown) {
    console.error("recordFigmaReferences threw", { thrown });
  }
}

export type RemoveDesignReferenceResult =
  | { status: "removed" }
  | { status: "error" };

export async function removeDesignReference(
  referenceId: string,
): Promise<RemoveDesignReferenceResult> {
  const id = z.string().uuid().safeParse(referenceId);
  if (!id.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeRemoveDesignReference } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeRemoveDesignReference(id.data);
    }
    const supabase = await createClient(new Headers());
    const { error } = await supabase.rpc("delete_design_reference", {
      target_reference_id: id.data,
    });
    if (error) {
      console.error("removeDesignReference RPC error", {
        referenceId: id.data,
        error,
      });
      return { status: "error" };
    }
    return { status: "removed" };
  } catch (thrown) {
    console.error("removeDesignReference threw", {
      referenceId: id.data,
      thrown,
    });
    return { status: "error" };
  }
}

const ReferenceIdentityRow = z
  .object({
    id: z.string().uuid(),
    room_id: z.string().uuid(),
    normalized_url: z.string(),
  })
  .passthrough();

// Turns a `pending` reference into `ok` (thumbnail cached) or `failed`
// (oEmbed unreachable / no thumbnail). Editor authority is enforced by
// add_design_reference (can_edit_room) -- a non-editor's upsert errors, and
// this returns null the same as any other hard failure. Best-effort like its
// siblings: no failure mode here ever throws past this function.
export async function refreshDesignReference(
  referenceId: string,
): Promise<DesignReferenceView | null> {
  const id = z.string().uuid().safeParse(referenceId);
  if (!id.success) return null;
  try {
    if (isRoomFakeEnabled()) {
      const { fakeRefreshDesignReference } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeRefreshDesignReference(id.data);
    }
    const supabase = await createClient(new Headers());
    const { data: rawRow } = await supabase
      .from("design_references")
      .select("id,room_id,normalized_url")
      .eq("id", id.data)
      .single();
    const row = ReferenceIdentityRow.safeParse(rawRow);
    if (!row.success) return null; // RLS/missing; add_design_reference re-checks edit access anyway

    // Mirrors can_edit_room (participant.access = 'edit') so a non-editor
    // never drives Figma egress before add_design_reference would reject the
    // write anyway.
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id;
    if (!userId) return null;
    const { data: participant } = await supabase
      .from("room_participants")
      .select("access")
      .eq("room_id", row.data.room_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (participant?.access !== "edit") return null;

    const result = await fetchFigmaOEmbed(row.data.normalized_url);
    let thumbRef: string | null = null;
    if (result.ok && result.thumbnailUrl) {
      const image = await downloadCappedImage(result.thumbnailUrl);
      if (image) {
        const path = `${row.data.room_id}/${row.data.id}`;
        const up = await supabase.storage
          .from(THUMBNAIL_BUCKET)
          .upload(path, image.bytes, {
            contentType: image.contentType,
            upsert: true,
          });
        if (!up.error) thumbRef = path;
      }
    }
    const status = thumbRef ? "ok" : "failed";
    const { data: updated, error } = await supabase.rpc("add_design_reference", {
      target_room_id: row.data.room_id,
      url: row.data.normalized_url,
      ref_title: result.title,
      thumb: thumbRef,
      status,
    });
    if (error || !updated) return null;

    // Exactly one path to sign here (this row's own thumbnail, if any) --
    // no batching needed, unlike the list reader's N-row case.
    let thumbnailUrl: string | null = null;
    if (thumbRef) {
      const signed = await supabase.storage
        .from(THUMBNAIL_BUCKET)
        .createSignedUrl(thumbRef, SIGNED_URL_TTL_SECONDS);
      thumbnailUrl = signed.data?.signedUrl ?? null;
    }
    return toReferenceView(updated, { thumbnailUrl });
  } catch (thrown) {
    console.error("refreshDesignReference threw", {
      referenceId: id.data,
      thrown,
    });
    return null;
  }
}
