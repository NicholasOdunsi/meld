"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

// The canvas renders every screen frame from the same token + component CSS
// the prototype uses; returning them here (not just a boolean) is what keeps
// a canvas preview styled instead of a flat, token-less wireframe.
export async function getActiveDesignProfile(
  roomId: string,
): Promise<{ hasActiveProfile: boolean; tokenCss: string; componentCss: string }> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return { hasActiveProfile: false, tokenCss: "", componentCss: "" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeGetActiveDesignProfile } = await import(
        "@/features/rooms/e2e-fake"
      );
      const fake = await fakeGetActiveDesignProfile(id.data);
      return { ...fake, componentCss: "" };
    }
    const supabase = await createClient(new Headers());
    const roomResult = await supabase
      .from("rooms")
      .select("workspace_id")
      .eq("id", id.data)
      .maybeSingle();
    if (roomResult.error) {
      console.error("getActiveDesignProfile rooms query error", { roomId, error: roomResult.error });
      return { hasActiveProfile: false, tokenCss: "", componentCss: "" };
    }
    const room = z
      .object({ workspace_id: z.string().uuid() })
      .strict()
      .safeParse(roomResult.data);
    if (!room.success) return { hasActiveProfile: false, tokenCss: "", componentCss: "" };
    const profileResult = await supabase
      .from("design_system_profiles")
      .select("active_version_id")
      .eq("workspace_id", room.data.workspace_id)
      .maybeSingle();
    if (profileResult.error) {
      console.error("getActiveDesignProfile profile query error", { roomId, error: profileResult.error });
      return { hasActiveProfile: false, tokenCss: "", componentCss: "" };
    }
    const profile = z
      .object({ active_version_id: z.string().uuid().nullable() })
      .strict()
      .safeParse(profileResult.data ?? { active_version_id: null });
    if (!profile.success || profile.data.active_version_id === null) {
      return { hasActiveProfile: false, tokenCss: "", componentCss: "" };
    }
    const cssResult = await supabase
      .from("design_system_profile_versions")
      .select("token_css,component_css")
      .eq("id", profile.data.active_version_id)
      .maybeSingle();
    const css = z
      .object({ token_css: z.string(), component_css: z.string().nullable() })
      .strict()
      .safeParse(cssResult.data ?? null);
    return {
      hasActiveProfile: true,
      tokenCss: css.success ? css.data.token_css : "",
      componentCss: css.success ? (css.data.component_css ?? "") : "",
    };
  } catch (thrown) {
    console.error("getActiveDesignProfile threw", { roomId, thrown });
    return { hasActiveProfile: false, tokenCss: "", componentCss: "" };
  }
}
