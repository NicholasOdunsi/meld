"use server";
import { z } from "zod";
import type { Provider } from "@meld/contracts";
import { createClient } from "@/lib/supabase/server";

// Each of these is a different thing for the person to DO, so each gets its
// own sentence. They all used to collapse into "Could not start the component
// build.", which told someone whose device was simply unpaired nothing at all
// -- and read as a bug in Meld rather than a step they had not taken.
//
// `start_design_component_build` raises these as bare message strings
// (202608270002 / 202608270007 / 202608270008), so they are matched on the
// message the way every other server action in this codebase matches a named
// database refusal. The database error itself is never shown.
const NO_SYSTEM = "Upload a design system before building its components.";
const NO_DEVICE =
  "Connect an agent device before building components. " +
  "Open Settings -> AI connections to pair one.";
const NOT_CONNECTED =
  "Your paired device no longer has that AI provider connected. " +
  "Open Settings -> AI connections to reconnect it.";
const NOT_EDITABLE =
  "You need edit access to this room to build its design system components.";
const UNAVAILABLE = "Could not start the component build.";

function startFailureMessage(message: string): string {
  if (message.includes("no_active_design_system")) return NO_SYSTEM;
  if (message.includes("no_execution_device")) return NO_DEVICE;
  if (message.includes("provider_not_connected")) return NOT_CONNECTED;
  if (message.includes("design_system_not_editable")) return NOT_EDITABLE;
  return UNAVAILABLE;
}

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
    return { status: "error", message: startFailureMessage(error.message) };
  }
  return { status: "started" };
}

// There is deliberately no recompileComponentCss here any more.
//
// `component_css` is now produced by the database, in the same statement that
// writes the merged `profile_json`
// (public.compile_design_component_css, 202608270009). Recompiling it from
// TypeScript meant the column was correct only for whoever happened to load
// the Design System page next -- every room prototype and every design-profile
// read in between got the pre-pass stylesheet -- and it meant two
// implementations of one rule were both authoritative. The write it needed
// (set_design_component_css) and the hole it needed in this table's
// immutability are both gone with it.

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
