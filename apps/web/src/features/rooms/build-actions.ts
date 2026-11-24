"use server";

import {
  ApprovalRequestSchema, BuildStatusSchema, ChangedFileSchema, CodeLinkTargetSchema,
} from "@meld/contracts";
import { z } from "zod";
import { resolveAgentReadiness } from "@/features/ai/agent-readiness";
import { listDevices } from "@/features/ai/device-service";
import { createClient } from "@/lib/supabase/server";

const Target = z.object({ roomId: z.uuid(), provider: z.enum(["claude", "codex"]).nullish(), model: z.string().trim().min(1).max(100).nullish() });
const CodeLinkRow = z.object({ device_id: z.uuid(), display_name: z.string() });
const BuildRow = z.object({
  star_task_id: z.uuid(),
  status: BuildStatusSchema,
  last_step: z.string().nullable(),
  branch: z.string().nullable(),
  reply: z.string().nullable(),
  changed_files: z.array(ChangedFileSchema),
  pending_approval: ApprovalRequestSchema.nullable(),
  engine_offline: z.boolean(),
});

type Client = Awaited<ReturnType<typeof createClient>>;

async function codeLink(supabase: Client, roomId: string) {
  const room = await supabase.from("rooms").select("project_id").eq("id", roomId).maybeSingle();
  if (room.error || !room.data?.project_id) throw new Error("This project is unavailable.");
  const link = await supabase.from("project_code_links").select("device_id,display_name").eq("project_id", room.data.project_id).maybeSingle();
  if (link.error) throw new Error("Could not read the project’s code link.");
  return link.data ? CodeLinkRow.parse(link.data) : null;
}

async function managedProvider(supabase: Client, deviceId: string, requested?: "claude" | "codex" | null) {
  const device = (await listDevices(supabase)).find((candidate) => candidate.id === deviceId && candidate.status === "active");
  const usable = device?.providers.filter((provider) => (provider.provider === "claude" || provider.provider === "codex")
    && provider.installation === "installed" && provider.authentication === "authenticated" && provider.compatibility === "supported") ?? [];
  const ready = requested ? usable.find((provider) => provider.provider === requested) : usable[0];
  if (!ready) throw new Error("Set up Claude or Codex on the linked Mac to build.");
  return ready.provider;
}

export async function readRoomBuilds(room: unknown) {
  const roomId = z.uuid().parse(room);
  const supabase = await createClient(new Headers());
  const [link, stars] = await Promise.all([
    codeLink(supabase, roomId),
    supabase.from("build_stars")
      .select("star_task_id,status,last_step,branch,reply,changed_files,pending_approval,engine_offline,room_stars!inner(room_id)")
      .eq("room_stars.room_id", roomId).order("updated_at", { ascending: false }).limit(100),
  ]);
  if (stars.error) throw new Error("Could not load the room’s builds.");
  const devices = link ? await listDevices(supabase).catch(() => []) : [];
  const device = devices.find(({ id }) => id === link?.device_id);
  const online = Boolean(device?.lastSeenAt && Date.now() - Date.parse(device.lastSeenAt) <= 75_000);
  return {
    link: link ? { displayName: link.display_name } : null,
    stars: z.array(BuildRow).parse(stars.data).map((star) => ({
      id: star.star_task_id, status: star.status, step: star.last_step, branch: star.branch,
      reply: star.reply, changedFiles: star.changed_files, approval: star.pending_approval,
      offline: star.engine_offline || Boolean(device && !online),
    })),
  };
}

export async function enqueueCodeLink(value: unknown) {
  const input = Target.extend({ deviceId: z.uuid().optional(), target: CodeLinkTargetSchema }).parse(value);
  const supabase = await createClient(new Headers());
  const readiness = await resolveAgentReadiness(supabase);
  const deviceId = input.deviceId ?? (readiness.ready ? readiness.defaultDeviceId : null);
  if (!deviceId) throw new Error("Connect a Mac with Claude or Codex before linking code.");
  const provider = await managedProvider(supabase, deviceId, input.provider);
  const result = await supabase.rpc("queue_build_task", {
    target_room_id: input.roomId, target_kind: "code_link", target_provider: provider,
    target_device_id: deviceId, target_link: input.target,
  });
  if (result.error) throw new Error("Could not queue the code link. Check the repository and the paired Mac.");
  return z.uuid().parse(result.data);
}

export async function sendBuildMessage(value: unknown) {
  const input = Target.extend({
    body: z.string().trim().min(1).max(10_000),
    clientId: z.uuid(),
    starTaskId: z.uuid().optional(),
  }).parse(value);
  const supabase = await createClient(new Headers());
  const link = await codeLink(supabase, input.roomId);
  if (!link) return { status: "link_required" as const };
  const provider = await managedProvider(supabase, link.device_id, input.provider);
  const result = await supabase.rpc("post_build_message", {
    target_room_id: input.roomId, target_client_id: input.clientId, target_body: input.body,
    target_provider: provider, target_model: input.model ?? null, target_star_task_id: input.starTaskId ?? null,
  });
  if (result.error) {
    throw new Error(result.error.message === "build_star_busy"
      ? "This Star is still building. Wait for the current step to finish."
      : "Could not queue this build on your Mac.");
  }
  const { taskId, messageId } = z.object({ taskId: z.uuid(), messageId: z.uuid() }).parse(result.data);
  return { status: "queued" as const, taskId, messageId };
}

export async function respondToBuildApproval(value: unknown) {
  const input = Target.extend({
    starTaskId: z.uuid(), requestId: ApprovalRequestSchema.shape.id, decision: z.enum(["accept", "decline"]),
  }).parse(value);
  const supabase = await createClient(new Headers());
  const link = await codeLink(supabase, input.roomId);
  if (!link) throw new Error("The project’s linked Mac is unavailable.");
  const provider = await managedProvider(supabase, link.device_id, input.provider);
  const result = await supabase.rpc("queue_build_task", {
    target_room_id: input.roomId, target_kind: "build_approval", target_provider: provider,
    target_star_task_id: input.starTaskId, target_approval_id: input.requestId, target_approval_decision: input.decision,
  });
  if (result.error) throw new Error("That approval could not be sent. Refresh the build status and try again.");
  return z.uuid().parse(result.data);
}
