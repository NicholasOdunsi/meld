import "server-only";

import {
  assembleValidatedPrototype,
  DesignScreenActionSchema,
  type PrototypeScreen,
} from "@meld/prototype";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

const PrototypeIdsSchema = z
  .object({
    workspaceId: z.string().uuid(),
    roomId: z.string().uuid(),
  })
  .strict();

const ScreenRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    current_version_id: z.string().uuid(),
    flow_node_id: z.string().nullable(),
    canvas_x: z.number(),
  })
  .strict();

const VersionRowSchema = z
  .object({
    id: z.string().uuid(),
    screen_id: z.string().uuid(),
    markup: z.string(),
    styles: z.string(),
    script: z.string().nullable(),
    actions_json: z.array(DesignScreenActionSchema),
  })
  .strict();

export type RoomPrototype = {
  html: string;
  screenCount: number;
};

function assembleRoomPrototype(
  screens: PrototypeScreen[],
  tokenCss: string,
): RoomPrototype | null {
  if (screens.length === 0) return null;
  return {
    html: assembleValidatedPrototype({
      screens,
      startScreenId: screens[0].id,
      tokenCss,
    }),
    screenCount: screens.length,
  };
}

export async function getRoomPrototype(
  workspaceId: string,
  roomId: string,
): Promise<RoomPrototype | null> {
  const ids = PrototypeIdsSchema.safeParse({ workspaceId, roomId });
  if (!ids.success) return null;

  try {
    if (isRoomFakeEnabled()) {
      const { fakeListRoomPrototypeScreens } = await import(
        "@/features/rooms/e2e-fake"
      );
      return assembleRoomPrototype(
        await fakeListRoomPrototypeScreens(ids.data),
        "",
      );
    }

    const supabase = await createClient(new Headers());
    const screensResult = await supabase
      .from("design_screens")
      .select("id,name,current_version_id,flow_node_id,canvas_x")
      .eq("workspace_id", ids.data.workspaceId)
      .eq("room_id", ids.data.roomId)
      .eq("state", "built")
      .is("deleted_at", null)
      .not("current_version_id", "is", null)
      .order("canvas_x", { ascending: true });

    if (screensResult.error) {
      console.error("prototype screens read failed", screensResult.error);
      return null;
    }

    const screens = z.array(ScreenRowSchema).safeParse(screensResult.data);
    if (!screens.success) {
      console.error("prototype screens response invalid", screens.error);
      return null;
    }
    if (screens.data.length === 0) return null;

    const orderedScreens = screens.data.toSorted(
      (left, right) =>
        left.canvas_x - right.canvas_x || left.id.localeCompare(right.id),
    );

    const versionsResult = await supabase
      .from("design_screen_versions")
      .select("id,screen_id,markup,styles,script,actions_json")
      .in(
        "id",
        orderedScreens.map((screen) => screen.current_version_id),
      );

    if (versionsResult.error) {
      console.error("prototype versions read failed", versionsResult.error);
      return null;
    }

    const versions = z.array(VersionRowSchema).safeParse(versionsResult.data);
    if (!versions.success) {
      console.error("prototype versions response invalid", versions.error);
      return null;
    }

    const versionsById = new Map(
      versions.data.map((version) => [version.id, version]),
    );
    const built: PrototypeScreen[] = [];

    for (const screen of orderedScreens) {
      const version = versionsById.get(screen.current_version_id);
      if (!version || version.screen_id !== screen.id) continue;
      built.push({
        id: screen.id,
        name: screen.name,
        markup: version.markup,
        styles: version.styles,
        script: version.script,
        actions: version.actions_json,
      });
    }

    let tokenCss = "";
    const profileResult = await supabase
      .from("design_system_profiles")
      .select("active_version_id")
      .eq("workspace_id", ids.data.workspaceId)
      .maybeSingle();
    const activeId = z
      .object({ active_version_id: z.string().uuid().nullable() })
      .strict()
      .safeParse(profileResult.data ?? { active_version_id: null });
    if (activeId.success && activeId.data.active_version_id) {
      const cssResult = await supabase
        .from("design_system_profile_versions")
        .select("token_css")
        .eq("id", activeId.data.active_version_id)
        .maybeSingle();
      const css = z
        .object({ token_css: z.string() })
        .strict()
        .safeParse(cssResult.data ?? null);
      if (css.success) tokenCss = css.data.token_css;
    }

    return assembleRoomPrototype(built, tokenCss);
  } catch (thrown) {
    console.error("getRoomPrototype failed", thrown);
    return null;
  }
}
