"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

export type DeleteDesignScreenResult =
  | { status: "deleted" }
  | { status: "error" };

// Soft-deletes a canvas screen (delete_design_screen, editor-gated). The
// canvas calls this when a user removes a screen's frame from the tldraw
// board, so the deletion survives a refresh instead of the frame being
// recreated by reconcileScreenFrames -- see screen-frame-reconcile.ts.
export async function deleteDesignScreen(
  screenId: string,
): Promise<DeleteDesignScreenResult> {
  const id = z.string().uuid().safeParse(screenId);
  if (!id.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeDeleteDesignScreen } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeDeleteDesignScreen(id.data);
    }
    const supabase = await createClient(new Headers());
    const { error } = await supabase.rpc("delete_design_screen", {
      target_screen_id: id.data,
    });
    if (error) {
      console.error("deleteDesignScreen RPC error", {
        screenId: id.data,
        error,
      });
      return { status: "error" };
    }
    return { status: "deleted" };
  } catch (thrown) {
    console.error("deleteDesignScreen threw", { screenId: id.data, thrown });
    return { status: "error" };
  }
}

export type RestoreDesignScreenResult =
  | { status: "restored" }
  | { status: "error" };

// Undoes deleteDesignScreen (restore_design_screen). The canvas calls this
// when tldraw's own undo stack (ctrl/cmd+Z) brings a just-deleted frame back,
// so the screen's server-side deletion is undone to match.
export async function restoreDesignScreen(
  screenId: string,
): Promise<RestoreDesignScreenResult> {
  const id = z.string().uuid().safeParse(screenId);
  if (!id.success) return { status: "error" };
  try {
    if (isRoomFakeEnabled()) {
      const { fakeRestoreDesignScreen } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeRestoreDesignScreen(id.data);
    }
    const supabase = await createClient(new Headers());
    const { error } = await supabase.rpc("restore_design_screen", {
      target_screen_id: id.data,
    });
    if (error) {
      console.error("restoreDesignScreen RPC error", {
        screenId: id.data,
        error,
      });
      return { status: "error" };
    }
    return { status: "restored" };
  } catch (thrown) {
    console.error("restoreDesignScreen threw", { screenId: id.data, thrown });
    return { status: "error" };
  }
}
