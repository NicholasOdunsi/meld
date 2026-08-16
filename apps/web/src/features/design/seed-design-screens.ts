"use server";
import { ScreenSeedSchema, type ScreenSeed } from "@meld/prototype";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import type { CanvasScreen } from "./canvas-screen-reader";

const SeedInput = z
  .object({ roomId: z.string().uuid(), seeds: z.array(ScreenSeedSchema) })
  .strict();

const InsertedRow = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    flow_node_id: z.string().nullable(),
    canvas_x: z.number(),
    canvas_y: z.number(),
    state: z.enum(["empty", "built"]),
  })
  .passthrough();

export async function seedDesignScreensFromFlow(
  input: z.input<typeof SeedInput>,
): Promise<CanvasScreen[]> {
  const parsed = SeedInput.safeParse(input);
  if (!parsed.success || parsed.data.seeds.length === 0) return [];
  const seeds = parsed.data.seeds;
  try {
    if (isRoomFakeEnabled()) {
      const { fakeSeedDesignScreensFromFlow } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeSeedDesignScreensFromFlow(parsed.data.roomId, seeds);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase.rpc("seed_design_screens_from_flow", {
      target_room_id: parsed.data.roomId,
      nodes: seeds.map((s: ScreenSeed) => ({ node_id: s.nodeId, name: s.name, x: s.x, y: s.y })),
    });
    if (error) {
      console.error("seedDesignScreensFromFlow RPC error", { error });
      return [];
    }
    const rows = z.array(InsertedRow).safeParse(Array.isArray(data) ? data : []);
    if (!rows.success) return [];
    return rows.data.map((row): CanvasScreen => ({
      id: row.id,
      name: row.name,
      canvasX: row.canvas_x,
      canvasY: row.canvas_y,
      flowNodeId: row.flow_node_id,
      state: row.state,
      // A freshly seeded screen has no semantic key yet.
      screenKey: null,
      formFactor: "desktop",
      // A freshly seeded screen doesn't reference a layout yet either.
      layout: null,
      layoutKey: null,
      layoutName: null,
      preview: null,
    }));
  } catch (thrown) {
    console.error("seedDesignScreensFromFlow threw", { thrown });
    return [];
  }
}
