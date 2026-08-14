"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { extractFigmaReferences } from "@/features/design/figma-url";

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
