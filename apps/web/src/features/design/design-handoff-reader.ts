"use server";
import { DesignHandoffManifestSchema, type DesignHandoffView } from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

const HandoffSnapshotRow = z
  .object({
    id: z.string().uuid(),
    manifest_json: z.unknown(),
    start_screen_id: z.string().uuid().nullable(),
    profile_version_id: z.string().uuid().nullable(),
    prd_revision: z.number().nullable(),
    created_at: z.string(),
  })
  .passthrough();

export async function getRoomDesignHandoff(
  roomId: string,
): Promise<DesignHandoffView | null> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return null;
  try {
    if (isRoomFakeEnabled()) {
      const { fakeGetRoomDesignHandoff } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeGetRoomDesignHandoff(id.data);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase
      .from("design_handoff_snapshots")
      .select(
        "id,manifest_json,start_screen_id,profile_version_id,prd_revision,created_at",
      )
      .eq("room_id", id.data)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("getRoomDesignHandoff error", { roomId, error });
      return null;
    }
    if (!data) return null;
    const row = HandoffSnapshotRow.safeParse(data);
    if (!row.success) {
      console.error("getRoomDesignHandoff row parse failure", {
        roomId,
        issues: row.error.issues,
      });
      return null;
    }
    const manifest = DesignHandoffManifestSchema.safeParse(
      row.data.manifest_json,
    );
    if (!manifest.success) {
      console.error("getRoomDesignHandoff manifest parse failure", {
        roomId,
        issues: manifest.error.issues,
      });
      return null;
    }
    return {
      id: row.data.id,
      manifest: manifest.data,
      startScreenId: row.data.start_screen_id,
      profileVersionId: row.data.profile_version_id,
      prdRevision: row.data.prd_revision,
      createdAt: row.data.created_at,
    };
  } catch (thrown) {
    console.error("getRoomDesignHandoff threw", { roomId, thrown });
    return null;
  }
}
