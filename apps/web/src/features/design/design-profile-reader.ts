"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

export async function getActiveDesignProfile(
  roomId: string,
): Promise<{ hasActiveProfile: boolean }> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return { hasActiveProfile: false };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeGetActiveDesignProfile } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeGetActiveDesignProfile(id.data);
    }
    const supabase = await createClient(new Headers());
    const roomResult = await supabase
      .from("rooms")
      .select("workspace_id")
      .eq("id", id.data)
      .maybeSingle();
    if (roomResult.error) {
      console.error("getActiveDesignProfile rooms query error", { roomId, error: roomResult.error });
      return { hasActiveProfile: false };
    }
    const room = z
      .object({ workspace_id: z.string().uuid() })
      .strict()
      .safeParse(roomResult.data);
    if (!room.success) return { hasActiveProfile: false };
    const profileResult = await supabase
      .from("design_system_profiles")
      .select("active_version_id")
      .eq("workspace_id", room.data.workspace_id)
      .maybeSingle();
    if (profileResult.error) {
      console.error("getActiveDesignProfile profile query error", { roomId, error: profileResult.error });
      return { hasActiveProfile: false };
    }
    const profile = z
      .object({ active_version_id: z.string().uuid().nullable() })
      .strict()
      .safeParse(profileResult.data ?? { active_version_id: null });
    return { hasActiveProfile: profile.success && profile.data.active_version_id !== null };
  } catch (thrown) {
    console.error("getActiveDesignProfile threw", { roomId, thrown });
    return { hasActiveProfile: false };
  }
}
