"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

// The canvas renders every screen frame from the same token CSS the prototype
// uses; returning it here (not just a boolean) is what keeps a canvas preview
// styled instead of a flat, token-less wireframe.
export async function getActiveDesignProfile(
  roomId: string,
): Promise<{ hasActiveProfile: boolean; tokenCss: string }> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return { hasActiveProfile: false, tokenCss: "" };
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
      return { hasActiveProfile: false, tokenCss: "" };
    }
    const room = z
      .object({ workspace_id: z.string().uuid() })
      .strict()
      .safeParse(roomResult.data);
    if (!room.success) return { hasActiveProfile: false, tokenCss: "" };
    const profileResult = await supabase
      .from("design_system_profiles")
      .select("active_version_id")
      .eq("workspace_id", room.data.workspace_id)
      .maybeSingle();
    if (profileResult.error) {
      console.error("getActiveDesignProfile profile query error", { roomId, error: profileResult.error });
      return { hasActiveProfile: false, tokenCss: "" };
    }
    const profile = z
      .object({ active_version_id: z.string().uuid().nullable() })
      .strict()
      .safeParse(profileResult.data ?? { active_version_id: null });
    if (!profile.success || profile.data.active_version_id === null) {
      return { hasActiveProfile: false, tokenCss: "" };
    }
    const cssResult = await supabase
      .from("design_system_profile_versions")
      .select("token_css")
      .eq("id", profile.data.active_version_id)
      .maybeSingle();
    const css = z
      .object({ token_css: z.string() })
      .strict()
      .safeParse(cssResult.data ?? null);
    return {
      hasActiveProfile: true,
      tokenCss: css.success ? css.data.token_css : "",
    };
  } catch (thrown) {
    console.error("getActiveDesignProfile threw", { roomId, thrown });
    return { hasActiveProfile: false, tokenCss: "" };
  }
}
