import "server-only";

import {
  DesignScreenActionSchema,
  resolveActionTargets,
  type DesignScreenPayload,
} from "@meld/prototype";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { readRoomActionLinks } from "@/features/design/action-links-reader";

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
        "id,name,canvas_x,canvas_y,flow_node_id,state,current_version_id,screen_key",
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

    const currentVersionIds = screens.data.flatMap((screen) =>
      screen.current_version_id ? [screen.current_version_id] : [],
    );
    if (currentVersionIds.length === 0) {
      return {
        ok: true,
        screens: screens.data.map(toCanvasScreenWithoutPreview),
      };
    }

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

    const versionsById = new Map(
      versions.data.map((version) => [version.id, version]),
    );

    // Every live screen in the room (built or still empty) is a legal
    // navigation target for the canvas overlay: a `targetNodeId` resolves
    // through this map, and a manual override pointing outside it is dropped
    // rather than resolved to a dead screen (see readRoomActionLinks).
    const nodeToScreenId = new Map(
      screens.data.flatMap((screen) =>
        screen.flow_node_id ? [[screen.flow_node_id, screen.id] as const] : [],
      ),
    );
    const overridesByScreen = await readRoomActionLinks(
      id.data,
      screens.data.map((screen) => screen.id),
    );

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
          preview:
            screen.state === "built" && version?.screen_id === screen.id
              ? {
                  markup: version.markup,
                  styles: version.styles,
                  script: version.script,
                  actions: resolveActionTargets(version.actions_json, {
                    nodeToScreenId,
                    overrides: overridesByScreen.get(screen.id),
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

function toCanvasScreenWithoutPreview(
  screen: z.infer<typeof CanvasScreenRowSchema>,
): CanvasScreen {
  return {
    id: screen.id,
    name: screen.name,
    canvasX: screen.canvas_x,
    canvasY: screen.canvas_y,
    flowNodeId: screen.flow_node_id,
    state: screen.state,
    screenKey: screen.screen_key,
    preview: null,
  };
}
