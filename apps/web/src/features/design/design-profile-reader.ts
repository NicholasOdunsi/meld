"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

export type ActiveDesignProfile = {
  /**
   * Whether this answer is trustworthy.
   *
   * `unavailable` means the read failed -- a query error, an unreadable room,
   * a throw -- and says NOTHING about whether a design system exists. This
   * used to be indistinguishable from a real negative: every failure path
   * returned `hasActiveProfile: false` with empty CSS, so a transient blip
   * told the room "No design system yet" and rendered every screen card
   * token-less. Callers must check this before believing the rest, and on
   * `unavailable` should keep whatever they already had.
   */
  status: "ok" | "unavailable";
  hasActiveProfile: boolean;
  tokenCss: string;
  componentCss: string;
};

const UNAVAILABLE: ActiveDesignProfile = {
  status: "unavailable",
  hasActiveProfile: false,
  tokenCss: "",
  componentCss: "",
};

// A real, checked negative: the workspace genuinely has no active design
// system. Distinct from UNAVAILABLE, which means we could not tell.
const NO_PROFILE: ActiveDesignProfile = {
  status: "ok",
  hasActiveProfile: false,
  tokenCss: "",
  componentCss: "",
};

// The canvas renders every screen frame from the same token + component CSS
// the prototype uses; returning them here (not just a boolean) is what keeps
// a canvas preview styled instead of a flat, token-less wireframe.
export async function getActiveDesignProfile(
  roomId: string,
): Promise<ActiveDesignProfile> {
  const id = z.string().uuid().safeParse(roomId);
  // Not a checked negative -- we were handed something we cannot look up, so
  // we do not know. Reporting "no design system" here would be a guess.
  if (!id.success) return UNAVAILABLE;
  try {
    if (isRoomFakeEnabled()) {
      const { fakeGetActiveDesignProfile } = await import(
        "@/features/rooms/e2e-fake"
      );
      const fake = await fakeGetActiveDesignProfile(id.data);
      return { status: "ok", ...fake };
    }
    const supabase = await createClient(new Headers());
    const roomResult = await supabase
      .from("rooms")
      .select("workspace_id")
      .eq("id", id.data)
      .maybeSingle();
    if (roomResult.error) {
      console.error("getActiveDesignProfile rooms query error", { roomId, error: roomResult.error });
      return UNAVAILABLE;
    }
    const room = z
      .object({ workspace_id: z.string().uuid() })
      .strict()
      .safeParse(roomResult.data);
    // No readable room means no workspace to look the profile up against. We
    // cannot conclude anything about the design system from that.
    if (!room.success) return UNAVAILABLE;
    const profileResult = await supabase
      .from("design_system_profiles")
      .select("active_version_id")
      .eq("workspace_id", room.data.workspace_id)
      .maybeSingle();
    if (profileResult.error) {
      console.error("getActiveDesignProfile profile query error", { roomId, error: profileResult.error });
      return UNAVAILABLE;
    }
    const profile = z
      .object({ active_version_id: z.string().uuid().nullable() })
      .strict()
      .safeParse(profileResult.data ?? { active_version_id: null });
    // The one genuine negative in this function: the query succeeded and there
    // is no active version. This is the only path allowed to say so.
    if (!profile.success || profile.data.active_version_id === null) {
      return NO_PROFILE;
    }
    const cssResult = await supabase
      .from("design_system_profile_versions")
      .select("token_css,component_css")
      .eq("id", profile.data.active_version_id)
      .maybeSingle();
    // A profile exists but its CSS is unreadable. Returning `hasActiveProfile:
    // true` with empty CSS here is what renders a screen card as a flat,
    // token-less wireframe -- so report it as unavailable and let the caller
    // keep the CSS it already has.
    if (cssResult.error) {
      console.error("getActiveDesignProfile css query error", { roomId, error: cssResult.error });
      return UNAVAILABLE;
    }
    const css = z
      .object({ token_css: z.string(), component_css: z.string().nullable() })
      .strict()
      .safeParse(cssResult.data ?? null);
    return {
      status: "ok",
      hasActiveProfile: true,
      tokenCss: css.success ? css.data.token_css : "",
      componentCss: css.success ? (css.data.component_css ?? "") : "",
    };
  } catch (thrown) {
    console.error("getActiveDesignProfile threw", { roomId, thrown });
    return UNAVAILABLE;
  }
}
