"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

// Manual C2a link overrides drawn as canvas arrows. `sourceScreenId` is the
// screen whose nav button is being linked; `targetScreenId` is where it should
// navigate. `actionId` matches the stable data-meld-action id on the source
// screen's markup, so the same regex the table's CHECK enforces gates it here.
const ActionIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]{0,63}$/);

const SetLinkInput = z
  .object({
    sourceScreenId: z.string().uuid(),
    actionId: ActionIdSchema,
    targetScreenId: z.string().uuid(),
  })
  .strict();

const ClearLinkInput = z
  .object({
    sourceScreenId: z.string().uuid(),
    actionId: ActionIdSchema,
  })
  .strict();

const LINK_ERROR = "We could not link these screens.";
const UNLINK_ERROR = "We could not unlink these screens.";

export type SetDesignScreenActionLinkResult =
  | { status: "linked" }
  | { status: "error"; message: string };

export type ClearDesignScreenActionLinkResult =
  | { status: "cleared" }
  | { status: "error"; message: string };

export async function setDesignScreenActionLink(
  input: z.input<typeof SetLinkInput>,
): Promise<SetDesignScreenActionLinkResult> {
  const parsed = SetLinkInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: LINK_ERROR };
  // A screen cannot link to itself; the RPC also rejects this, but bailing
  // early avoids a pointless round trip.
  if (parsed.data.sourceScreenId === parsed.data.targetScreenId) {
    return { status: "error", message: LINK_ERROR };
  }
  try {
    if (isRoomFakeEnabled()) return { status: "linked" };
    const supabase = await createClient(new Headers());
    const { error } = await supabase.rpc("set_design_screen_action_link", {
      target_screen_id: parsed.data.sourceScreenId,
      target_action_id: parsed.data.actionId,
      target_link_screen_id: parsed.data.targetScreenId,
    });
    if (error) {
      console.error("setDesignScreenActionLink RPC error", error);
      return { status: "error", message: LINK_ERROR };
    }
    return { status: "linked" };
  } catch (thrown) {
    console.error("setDesignScreenActionLink threw", thrown);
    return { status: "error", message: LINK_ERROR };
  }
}

export async function clearDesignScreenActionLink(
  input: z.input<typeof ClearLinkInput>,
): Promise<ClearDesignScreenActionLinkResult> {
  const parsed = ClearLinkInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: UNLINK_ERROR };
  try {
    if (isRoomFakeEnabled()) return { status: "cleared" };
    const supabase = await createClient(new Headers());
    const { error } = await supabase.rpc("clear_design_screen_action_link", {
      target_screen_id: parsed.data.sourceScreenId,
      target_action_id: parsed.data.actionId,
    });
    if (error) {
      console.error("clearDesignScreenActionLink RPC error", error);
      return { status: "error", message: UNLINK_ERROR };
    }
    return { status: "cleared" };
  } catch (thrown) {
    console.error("clearDesignScreenActionLink threw", thrown);
    return { status: "error", message: UNLINK_ERROR };
  }
}
