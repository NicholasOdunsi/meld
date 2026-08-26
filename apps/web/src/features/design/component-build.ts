"use server";
import { z } from "zod";
import type { Provider } from "@meld/contracts";
import { DesignProfileSchema } from "@meld/contracts";
import { compileComponentCss } from "@meld/prototype";
import { createClient } from "@/lib/supabase/server";

const NO_SYSTEM = "Upload a design system before building its components.";
const UNAVAILABLE = "Could not start the component build.";

export async function startComponentBuild(
  roomId: string,
  provider: Provider,
): Promise<{ status: "started" } | { status: "error"; message: string }> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return { status: "error", message: UNAVAILABLE };

  const supabase = await createClient(new Headers());
  const { error } = await supabase.rpc("start_design_component_build", {
    target_room_id: id.data,
    target_provider: provider,
  });

  if (error) {
    return {
      status: "error",
      message: error.message.includes("no_active_design_system")
        ? NO_SYSTEM
        : UNAVAILABLE,
    };
  }
  return { status: "started" };
}

// A build pass merges each batch into a COPY of the profile
// (202608270002_design_component_build.sql), and every one of those copies
// -- including the one the pass finally leaves active -- carries
// component_css forward unchanged from whichever version it was copied
// from. So the moment a batch actually builds a component into
// profile_json, component_css is describing a design system that no
// longer exists. This recompiles it deterministically from the merged
// profile and writes it back.
//
// design_system_profile_versions rows are otherwise immutable
// (design_profile_version_immutable, 202608130005) and authenticated has no
// UPDATE grant on the table at all -- only SELECT. As written, that trigger
// didn't distinguish columns; it refused every update unconditionally. Both
// gaps are closed in 202608270004_recompile_design_component_css.sql, which
// narrows the trigger to allow a component_css-only update and adds
// set_design_component_css as the one sanctioned way to make it, mirroring
// how set_active_design_profile_version already does this for the active
// pointer. See that migration's header comment for the full reasoning.
export async function recompileComponentCss(versionId: string): Promise<void> {
  const id = z.string().uuid().safeParse(versionId);
  if (!id.success) return;

  try {
    const supabase = await createClient(new Headers());
    const versionResult = await supabase
      .from("design_system_profile_versions")
      .select("profile_json")
      .eq("id", id.data)
      .maybeSingle();
    if (versionResult.error) {
      console.error("recompileComponentCss version query error", {
        versionId,
        error: versionResult.error,
      });
      return;
    }

    const version = z
      .object({ profile_json: z.unknown() })
      .strict()
      .safeParse(versionResult.data);
    if (!version.success) return;

    const profile = DesignProfileSchema.safeParse(version.data.profile_json);
    if (!profile.success) return;

    const css = compileComponentCss(profile.data);
    const { error } = await supabase.rpc("set_design_component_css", {
      target_version_id: id.data,
      css,
    });
    if (error) {
      console.error("recompileComponentCss write error", { versionId, error });
    }
  } catch (thrown) {
    console.error("recompileComponentCss threw", { versionId, thrown });
  }
}

const PassRoomRow = z.object({ room_id: z.string().uuid() }).strict();
const DistillRoomRow = z.object({ room_id: z.string().uuid() }).strict();

function firstRow<T>(schema: z.ZodType<T>, data: unknown): T | null {
  const rows = Array.isArray(data) ? data : [];
  const parsed = schema.safeParse(rows[0]);
  return parsed.success ? parsed.data : null;
}

// The Design System page is workspace-scoped, but every AI task -- including
// a component build pass -- needs a room to run in. There is no
// "workspace's own room" concept, so the room is resolved from whichever of
// the workspace's own design-system records already carries one: an
// in-progress or already-finished build pass first (it is the most recent
// thing that touched this workspace's components), and otherwise the distill
// that produced the design system's active version.
export async function resolveComponentBuildRoomId(
  workspaceId: string,
): Promise<string | null> {
  const id = z.string().uuid().safeParse(workspaceId);
  if (!id.success) return null;

  try {
    const supabase = await createClient(new Headers());

    const passResult = await supabase
      .from("design_component_build_passes")
      .select("room_id")
      .eq("workspace_id", id.data)
      .order("created_at", { ascending: false })
      .limit(1);
    if (passResult.error) {
      console.error("resolveComponentBuildRoomId pass query error", {
        workspaceId,
        error: passResult.error,
      });
      return null;
    }
    const pass = firstRow(PassRoomRow, passResult.data);
    if (pass) return pass.room_id;

    const profileResult = await supabase
      .from("design_system_profiles")
      .select("active_version_id")
      .eq("workspace_id", id.data)
      .maybeSingle();
    if (profileResult.error) {
      console.error("resolveComponentBuildRoomId profile query error", {
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

    const distillResult = await supabase
      .from("design_profile_distills")
      .select("room_id")
      .eq("version_id", profile.data.active_version_id)
      .limit(1);
    if (distillResult.error) {
      console.error("resolveComponentBuildRoomId distill query error", {
        workspaceId,
        error: distillResult.error,
      });
      return null;
    }
    const distill = firstRow(DistillRoomRow, distillResult.data);
    return distill ? distill.room_id : null;
  } catch (thrown) {
    console.error("resolveComponentBuildRoomId threw", { workspaceId, thrown });
    return null;
  }
}

// True once a build pass has finished and its rebuilt version is the one now
// active -- the moment recompileComponentCss needs to run, since that is
// exactly when component_css last went stale. Cheap and idempotent to check
// on every page load: recompiling twice writes the same deterministic string
// back, and skipping the check would leave the page showing a design system
// whose components look right but whose CSS still belongs to the version
// before them.
export async function recompileComponentCssIfPassCompleted(
  workspaceId: string,
): Promise<void> {
  const id = z.string().uuid().safeParse(workspaceId);
  if (!id.success) return;

  try {
    const supabase = await createClient(new Headers());
    const profileResult = await supabase
      .from("design_system_profiles")
      .select("active_version_id")
      .eq("workspace_id", id.data)
      .maybeSingle();
    if (profileResult.error) return;
    const profile = z
      .object({ active_version_id: z.string().uuid().nullable() })
      .strict()
      .safeParse(profileResult.data ?? { active_version_id: null });
    if (!profile.success || profile.data.active_version_id === null) return;

    const passResult = await supabase
      .from("design_component_build_passes")
      .select("id")
      .eq("workspace_id", id.data)
      .eq("target_version_id", profile.data.active_version_id)
      .not("completed_at", "is", null)
      .limit(1);
    if (passResult.error) return;
    const completed = firstRow(z.object({ id: z.string().uuid() }).strict(), passResult.data);
    if (!completed) return;

    await recompileComponentCss(profile.data.active_version_id);
  } catch (thrown) {
    console.error("recompileComponentCssIfPassCompleted threw", { workspaceId, thrown });
  }
}
