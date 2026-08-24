import "server-only";

import {
  assembleValidatedPrototype,
  DesignScreenActionSchema,
  FORM_FACTORS,
  resolveActionTargets,
  type FormFactor,
  type PrototypeLayout,
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
    screen_key: z.string().nullable(),
    layout_id: z.string().uuid().nullable(),
    form_factor: z.enum(FORM_FACTORS),
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

const LayoutRowSchema = z
  .object({
    id: z.string().uuid(),
    current_version_id: z.string().uuid().nullable(),
  })
  .strict();

const LayoutVersionRowSchema = z
  .object({
    id: z.string().uuid(),
    layout_id: z.string().uuid(),
    shell_markup: z.string(),
    shell_styles: z.string(),
    actions_json: z.array(DesignScreenActionSchema),
  })
  .strict();

// A named, sized reference to one assembled screen -- everything the pill
// needs to list screens and draw their thumbnails without pulling in the
// screen's markup/styles/actions. Order matches canvas order (see
// `assembleRoomPrototype` below), because the pill lists screens in that
// order and defaults to the first one.
export type PrototypeScreenSummary = {
  id: string;
  name: string;
  formFactor: FormFactor;
};

export type RoomPrototype = {
  html: string;
  screenCount: number;
  screens: PrototypeScreenSummary[];
};

export function assembleRoomPrototype(
  screens: PrototypeScreen[],
  tokenCss: string,
  componentCss: string,
  startScreenId?: string,
): RoomPrototype | null {
  if (screens.length === 0) return null;
  // A start screen only wins if it's actually one of the assembled screens
  // (a built, live screen in this room) -- an invalid, absent, or stale id
  // (e.g. the screen was since unbuilt or deleted) falls back to the first
  // screen, matching the pre-existing default.
  const resolvedStart =
    startScreenId && screens.some((screen) => screen.id === startScreenId)
      ? startScreenId
      : screens[0].id;
  return {
    html: assembleValidatedPrototype({
      screens,
      startScreenId: resolvedStart,
      tokenCss,
      componentCss,
    }),
    screenCount: screens.length,
    screens: screens.map((screen) => ({
      id: screen.id,
      name: screen.name,
      formFactor: screen.formFactor ?? "desktop",
    })),
  };
}

export async function getRoomPrototype(
  workspaceId: string,
  roomId: string,
  startScreenId?: string,
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
        "",
        startScreenId,
      );
    }

    const supabase = await createClient(new Headers());
    const screensResult = await supabase
      .from("design_screens")
      .select(
        "id,name,current_version_id,flow_node_id,canvas_x,screen_key,layout_id,form_factor",
      )
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

    // Screens actually assembled into the prototype (built, live) are the only
    // legal navigation targets: a `targetScreenKey` resolves through this map
    // -- built once from every screen in this read, so an action referencing a
    // screen built later (or earlier) in canvas order still resolves.
    const keyToScreenId = new Map(
      orderedScreens.flatMap((screen) =>
        screen.screen_key ? [[screen.screen_key, screen.id] as const] : [],
      ),
    );

    const layoutIds = orderedScreens.flatMap((screen) =>
      screen.layout_id ? [screen.layout_id] : [],
    );

    let layoutsById = new Map<string, PrototypeLayout>();
    if (layoutIds.length > 0) {
      const layoutsResult = await supabase
        .from("design_layouts")
        .select("id,current_version_id")
        .eq("workspace_id", ids.data.workspaceId)
        .eq("room_id", ids.data.roomId)
        .is("deleted_at", null)
        .in("id", layoutIds);

      if (layoutsResult.error) {
        console.error("prototype layouts read failed", layoutsResult.error);
        return null;
      }

      const layouts = z.array(LayoutRowSchema).safeParse(layoutsResult.data);
      if (!layouts.success) {
        console.error("prototype layouts response invalid", layouts.error);
        return null;
      }

      const layoutVersionIds = layouts.data.flatMap((layout) =>
        layout.current_version_id ? [layout.current_version_id] : [],
      );

      if (layoutVersionIds.length > 0) {
        const layoutVersionsResult = await supabase
          .from("design_layout_versions")
          .select("id,layout_id,shell_markup,shell_styles,actions_json")
          .in("id", layoutVersionIds);

        if (layoutVersionsResult.error) {
          console.error(
            "prototype layout versions read failed",
            layoutVersionsResult.error,
          );
          return null;
        }

        const layoutVersions = z
          .array(LayoutVersionRowSchema)
          .safeParse(layoutVersionsResult.data);
        if (!layoutVersions.success) {
          console.error(
            "prototype layout versions response invalid",
            layoutVersions.error,
          );
          return null;
        }

        const layoutVersionsById = new Map(
          layoutVersions.data.map((version) => [version.id, version]),
        );

        layoutsById = new Map(
          layouts.data.flatMap((layout) => {
            const version = layout.current_version_id
              ? layoutVersionsById.get(layout.current_version_id)
              : undefined;
            if (!version || version.layout_id !== layout.id) return [];
            return [
              [
                layout.id,
                {
                  id: layout.id,
                  shellMarkup: version.shell_markup,
                  shellStyles: version.shell_styles,
                  actions: resolveActionTargets(version.actions_json, {
                    keyToScreenId,
                  }),
                },
              ] as const,
            ];
          }),
        );
      }
    }

    const built: PrototypeScreen[] = [];

    for (const screen of orderedScreens) {
      const version = versionsById.get(screen.current_version_id);
      if (!version || version.screen_id !== screen.id) continue;
      built.push({
        id: screen.id,
        name: screen.name,
        formFactor: screen.form_factor,
        markup: version.markup,
        styles: version.styles,
        script: version.script,
        layout: screen.layout_id
          ? (layoutsById.get(screen.layout_id) ?? null)
          : null,
        actions: resolveActionTargets(version.actions_json, {
          keyToScreenId,
        }),
      });
    }

    let tokenCss = "";
    let componentCss = "";
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
        .select("token_css,component_css")
        .eq("id", activeId.data.active_version_id)
        .maybeSingle();
      const css = z
        .object({ token_css: z.string(), component_css: z.string().nullable() })
        .strict()
        .safeParse(cssResult.data ?? null);
      if (css.success) {
        tokenCss = css.data.token_css;
        componentCss = css.data.component_css ?? "";
      }
    }

    return assembleRoomPrototype(built, tokenCss, componentCss, startScreenId);
  } catch (thrown) {
    console.error("getRoomPrototype failed", thrown);
    return null;
  }
}
