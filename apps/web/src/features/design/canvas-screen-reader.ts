import "server-only";

import {
  DesignScreenActionSchema,
  FORM_FACTORS,
  resolveActionTargets,
  type DesignScreenPayload,
  type FormFactor,
  type PrototypeLayout,
} from "@meld/prototype";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";

const RoomIdSchema = z.string().uuid();

const CanvasScreenRowSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    canvas_x: z.number(),
    canvas_y: z.number(),
    flow_node_id: z.string().nullable(),
    state: z.enum(["empty", "built"]),
    current_version_id: z.string().uuid().nullable(),
    screen_key: z.string().nullable(),
    form_factor: z.enum(FORM_FACTORS),
    layout_id: z.string().uuid().nullable(),
  })
  .strict();

const CanvasScreenVersionRowSchema = z
  .object({
    id: z.string().uuid(),
    screen_id: z.string().uuid(),
    markup: z.string(),
    styles: z.string(),
    script: z.string().nullable(),
    actions_json: z.array(DesignScreenActionSchema),
  })
  .strict();

const CanvasLayoutRowSchema = z
  .object({
    id: z.string().uuid(),
    current_version_id: z.string().uuid().nullable(),
  })
  .strict();

const CanvasLayoutVersionRowSchema = z
  .object({
    id: z.string().uuid(),
    layout_id: z.string().uuid(),
    shell_markup: z.string(),
    shell_styles: z.string(),
    actions_json: z.array(DesignScreenActionSchema),
  })
  .strict();

export type CanvasScreen = {
  id: string;
  name: string;
  canvasX: number;
  canvasY: number;
  flowNodeId: string | null;
  state: "empty" | "built";
  preview: DesignScreenPayload | null;
  // The screen's semantic key (Task 3 migration; resolved by readers in
  // Task 8). Null for legacy/unkeyed screens. Carried here now so the
  // composer's generation context (Task 7) can list existing screens by key
  // ahead of the readers actually resolving navigation through it.
  screenKey: string | null;
  // The device form factor the screen was designed for; sizes the canvas frame.
  formFactor: FormFactor;
  // The shared app-shell layout this screen composes into, resolved from
  // `layout_id`, or null for a standalone screen. The layout's own actions
  // are resolved through the same `keyToScreenId` map as screen actions, so
  // a nav target inside the shell (e.g. a shared "Back" control) resolves
  // identically to one authored on the screen itself.
  layout: PrototypeLayout | null;
};

export type CanvasScreenReadResult =
  | { ok: true; screens: CanvasScreen[] }
  | { ok: false; screens: [] };

export async function readRoomCanvasScreens(
  roomId: string,
): Promise<CanvasScreenReadResult> {
  const id = RoomIdSchema.safeParse(roomId);
  if (!id.success) return { ok: false, screens: [] };

  try {
    if (isRoomFakeEnabled()) {
      const { fakeListRoomCanvasScreens } = await import(
        "@/features/rooms/e2e-fake"
      );
      return {
        ok: true,
        screens: await fakeListRoomCanvasScreens(id.data),
      };
    }

    const supabase = await createClient(new Headers());
    const screensResult = await supabase
      .from("design_screens")
      .select(
        "id,name,canvas_x,canvas_y,flow_node_id,state,current_version_id,screen_key,form_factor,layout_id",
      )
      .eq("room_id", id.data)
      .is("deleted_at", null)
      .order("canvas_x", { ascending: true });

    if (screensResult.error) {
      console.error("canvas screens read failed", screensResult.error);
      return { ok: false, screens: [] };
    }

    const screens = z.array(CanvasScreenRowSchema).safeParse(screensResult.data);
    if (!screens.success) {
      console.error("canvas screens response invalid", screens.error);
      return { ok: false, screens: [] };
    }

    // Every live screen in the room (built or still empty) is a legal
    // navigation target for the canvas overlay: a `targetScreenKey` resolves
    // through this map, built once from every screen in this read so a
    // forward reference to a screen built later (or earlier) still resolves.
    // Also reused below to resolve a shared layout's own action targets.
    const keyToScreenId = new Map(
      screens.data.flatMap((screen) =>
        screen.screen_key ? [[screen.screen_key, screen.id] as const] : [],
      ),
    );

    const layoutsById = await fetchCanvasLayoutsById(
      supabase,
      id.data,
      screens.data.flatMap((screen) =>
        screen.layout_id ? [screen.layout_id] : [],
      ),
      keyToScreenId,
    );
    if (!layoutsById.ok) return { ok: false, screens: [] };

    const currentVersionIds = screens.data.flatMap((screen) =>
      screen.current_version_id ? [screen.current_version_id] : [],
    );

    let versionsById = new Map<
      string,
      z.infer<typeof CanvasScreenVersionRowSchema>
    >();
    if (currentVersionIds.length > 0) {
      const versionsResult = await supabase
        .from("design_screen_versions")
        .select("id,screen_id,markup,styles,script,actions_json")
        .eq("room_id", id.data)
        .in("id", currentVersionIds);

      if (versionsResult.error) {
        console.error(
          "canvas screen versions read failed",
          versionsResult.error,
        );
        return { ok: false, screens: [] };
      }

      const versions = z
        .array(CanvasScreenVersionRowSchema)
        .safeParse(versionsResult.data);
      if (!versions.success) {
        console.error("canvas screen versions response invalid", versions.error);
        return { ok: false, screens: [] };
      }

      versionsById = new Map(
        versions.data.map((version) => [version.id, version]),
      );
    }

    return {
      ok: true,
      screens: screens.data.map((screen): CanvasScreen => {
        const version = screen.current_version_id
          ? versionsById.get(screen.current_version_id)
          : undefined;
        return {
          id: screen.id,
          name: screen.name,
          canvasX: screen.canvas_x,
          canvasY: screen.canvas_y,
          flowNodeId: screen.flow_node_id,
          state: screen.state,
          screenKey: screen.screen_key,
          formFactor: screen.form_factor,
          layout: screen.layout_id
            ? (layoutsById.data.get(screen.layout_id) ?? null)
            : null,
          preview:
            screen.state === "built" && version?.screen_id === screen.id
              ? {
                  markup: version.markup,
                  styles: version.styles,
                  script: version.script,
                  actions: resolveActionTargets(version.actions_json, {
                    keyToScreenId,
                  }),
                }
              : null,
        };
      }),
    };
  } catch (thrown) {
    console.error("listRoomCanvasScreens failed", thrown);
    return { ok: false, screens: [] };
  }
}

export async function listRoomCanvasScreens(
  roomId: string,
): Promise<CanvasScreen[]> {
  return (await readRoomCanvasScreens(roomId)).screens;
}

// Batch-fetches every live layout referenced by `layoutIds` (deduped by the
// caller not required -- `.in` tolerates duplicates) and its current version,
// mirroring the screen/screen-version fetch above: a live `design_layouts`
// row, then the `design_layout_versions` row its `current_version_id` points
// to. A referenced layout that's missing, deleted, or has no promoted
// version simply has no entry in the returned map -- the caller treats that
// the same as no layout (null), not a read failure.
async function fetchCanvasLayoutsById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  roomId: string,
  layoutIds: string[],
  keyToScreenId: ReadonlyMap<string, string>,
): Promise<
  { ok: true; data: Map<string, PrototypeLayout> } | { ok: false }
> {
  if (layoutIds.length === 0) {
    return { ok: true, data: new Map() };
  }

  const layoutsResult = await supabase
    .from("design_layouts")
    .select("id,current_version_id")
    .eq("room_id", roomId)
    .is("deleted_at", null)
    .in("id", layoutIds);

  if (layoutsResult.error) {
    console.error("canvas screen layouts read failed", layoutsResult.error);
    return { ok: false };
  }

  const layouts = z.array(CanvasLayoutRowSchema).safeParse(layoutsResult.data);
  if (!layouts.success) {
    console.error("canvas screen layouts response invalid", layouts.error);
    return { ok: false };
  }

  const layoutVersionIds = layouts.data.flatMap((layout) =>
    layout.current_version_id ? [layout.current_version_id] : [],
  );
  if (layoutVersionIds.length === 0) {
    return { ok: true, data: new Map() };
  }

  const layoutVersionsResult = await supabase
    .from("design_layout_versions")
    .select("id,layout_id,shell_markup,shell_styles,actions_json")
    .eq("room_id", roomId)
    .in("id", layoutVersionIds);

  if (layoutVersionsResult.error) {
    console.error(
      "canvas screen layout versions read failed",
      layoutVersionsResult.error,
    );
    return { ok: false };
  }

  const layoutVersions = z
    .array(CanvasLayoutVersionRowSchema)
    .safeParse(layoutVersionsResult.data);
  if (!layoutVersions.success) {
    console.error(
      "canvas screen layout versions response invalid",
      layoutVersions.error,
    );
    return { ok: false };
  }

  const layoutVersionsById = new Map(
    layoutVersions.data.map((version) => [version.id, version]),
  );

  return {
    ok: true,
    data: new Map(
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
    ),
  };
}
