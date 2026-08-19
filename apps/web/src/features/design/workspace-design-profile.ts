"use server";
import { z } from "zod";
import { DesignProfileSchema, type DesignProfile } from "@meld/contracts";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

// The upcoming Design System viewer page needs the full profile (not just a
// boolean + CSS strings the way the canvas's getActiveDesignProfile does),
// read directly off a workspace -- no room hop, since the viewer is scoped to
// a workspace rather than a room.
export async function getWorkspaceDesignSystem(
  workspaceId: string,
): Promise<{ profile: DesignProfile; tokenCss: string; componentCss: string } | null> {
  const id = z.string().uuid().safeParse(workspaceId);
  if (!id.success) return null;
  try {
    if (isRoomFakeEnabled()) {
      const { fakeGetWorkspaceDesignSystem } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeGetWorkspaceDesignSystem(id.data);
    }
    const supabase = await createClient(new Headers());
    const profileResult = await supabase
      .from("design_system_profiles")
      .select("active_version_id")
      .eq("workspace_id", id.data)
      .maybeSingle();
    if (profileResult.error) {
      console.error("getWorkspaceDesignSystem profile query error", {
        workspaceId,
        error: profileResult.error,
      });
      return null;
    }
    const profile = z
      .object({ active_version_id: z.string().uuid().nullable() })
      .strict()
      .safeParse(profileResult.data ?? { active_version_id: null });
    if (!profile.success || profile.data.active_version_id === null) return null;

    const versionResult = await supabase
      .from("design_system_profile_versions")
      .select("profile_json,token_css,component_css")
      .eq("id", profile.data.active_version_id)
      .maybeSingle();
    if (versionResult.error) {
      console.error("getWorkspaceDesignSystem version query error", {
        workspaceId,
        error: versionResult.error,
      });
      return null;
    }
    const version = z
      .object({
        profile_json: z.unknown(),
        token_css: z.string(),
        component_css: z.string().nullable(),
      })
      .strict()
      .safeParse(versionResult.data);
    if (!version.success) return null;

    const parsedProfile = DesignProfileSchema.safeParse(version.data.profile_json);
    if (!parsedProfile.success) return null;

    return {
      profile: parsedProfile.data,
      tokenCss: version.data.token_css,
      componentCss: version.data.component_css ?? "",
    };
  } catch (thrown) {
    console.error("getWorkspaceDesignSystem threw", { workspaceId, thrown });
    return null;
  }
}
