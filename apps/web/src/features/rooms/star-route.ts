import "server-only";

import { StarRouteResultSchema, type Provider } from "@meld/contracts";
import { z } from "zod";
import { resolveAgentReadiness } from "@/features/ai/agent-readiness";
import { cancelAITask } from "@/features/ai/task-service";
import { createClient } from "@/lib/supabase/server";
import { readStarMetadata } from "./star-store";

const RouteInputSchema = z.object({
  roomId: z.string().uuid(),
  body: z.string().trim().min(1).max(10_000),
  providerOverride: z.string().nullish(),
  stars: z.array(z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120) })).max(5),
});

export type StarRouteChoice =
  | { decision: "new"; starTaskId: null; title: null }
  | { decision: "continue" | "ask"; starTaskId: string; title: string };

const NEW_STAR: StarRouteChoice = { decision: "new", starTaskId: null, title: null };
const ROUTE_DEADLINE_MS = 3_000;

export function validatedRouteChoice(result: unknown, candidates: readonly { id: string; title: string }[]): StarRouteChoice {
  const parsed = StarRouteResultSchema.safeParse(result);
  if (!parsed.success || parsed.data.decision === "new") return NEW_STAR;
  const star = candidates.find((item) => item.id === parsed.data.starTaskId);
  if (!star) return NEW_STAR;
  return { decision: parsed.data.decision, starTaskId: star.id, title: star.title };
}

export async function routeMainChatMessage(input: unknown): Promise<StarRouteChoice> {
  const parsed = RouteInputSchema.safeParse(input);
  if (!parsed.success || parsed.data.stars.length === 0) return NEW_STAR;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = performRoute(parsed.data);
  try {
    return await Promise.race([
      work,
      new Promise<StarRouteChoice>((resolve) => {
        timer = setTimeout(() => resolve(NEW_STAR), ROUTE_DEADLINE_MS);
      }),
    ]);
  } catch {
    return NEW_STAR;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function performRoute(input: z.infer<typeof RouteInputSchema>): Promise<StarRouteChoice> {
  const deadline = Date.now() + ROUTE_DEADLINE_MS;
  let taskId: string | undefined;
  const supabase = await createClient(new Headers());
  try {
    const [metadata, readiness] = await Promise.all([
      readStarMetadata(input.roomId), resolveAgentReadiness(supabase),
    ]);
    if (!readiness.ready || Date.now() >= deadline) return NEW_STAR;
    const allowed = new Map(metadata.stars.map((star) => [star.taskId, star.title]));
    const candidates = input.stars
      .filter((star) => allowed.has(star.id))
      .map((star) => ({ id: star.id, title: allowed.get(star.id)! }));
    if (candidates.length === 0) return NEW_STAR;
    const selected = readiness.providers.find((item) => item.provider === input.providerOverride)
      ?? readiness.providers.find((item) => item.provider === readiness.defaultProvider);
    if (!selected) return NEW_STAR;
    const instruction = JSON.stringify({ message: input.body, stars: candidates });
    const created = await supabase.rpc("create_ai_task", {
      target_room_id: input.roomId,
      target_device_id: selected.deviceId,
      target_provider: selected.provider as Provider,
      target_kind: "star_route",
      target_instruction: instruction,
      target_manifest: { messageIds: [], attachmentIds: [], evidenceIds: [], decisionIds: [] },
    });
    if (created.error) return NEW_STAR;
    const task = z.object({ id: z.string().uuid() }).parse(created.data);
    taskId = task.id;
    if (Date.now() >= deadline) return NEW_STAR;
    while (Date.now() < deadline) {
      const { data, error } = await supabase.rpc("read_star_route_result", { target_task_id: task.id });
      if (error) break;
      if (data) {
        if (Date.now() >= deadline) break;
        return validatedRouteChoice(data, candidates);
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(120, Math.max(0, deadline - Date.now()))));
    }
  } catch {
    // Routing can never prevent the message from being sent.
  }
  if (taskId) void cancelAITask(supabase, taskId).catch(() => {});
  return NEW_STAR;
}
