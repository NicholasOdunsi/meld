import "server-only";

import { getAuthenticatedRepository } from "./session";
import type { RoomConstellation, RoomStarMetadata } from "./star-types";

export async function readStarMetadata(roomId: string): Promise<{
  stars: RoomStarMetadata[];
  constellations: RoomConstellation[];
}> {
  const { supabase } = await getAuthenticatedRepository();
  const [starsResult, groupsResult, followupsResult] = await Promise.all([
    supabase.from("room_stars").select("task_id,title,constellation_id").eq("room_id", roomId),
    supabase.from("room_constellations").select("id,name").eq("room_id", roomId),
    supabase.from("room_star_followups").select("star_task_id,message_id").eq("room_id", roomId),
  ]);
  if (starsResult.error || groupsResult.error || followupsResult.error) throw new Error("Could not load Constellations.");
  const constellations = (groupsResult.data ?? []) as RoomConstellation[];
  const nameById = new Map(constellations.map((item) => [item.id, item.name]));
  const followupsByTask = new Map<string, string[]>();
  for (const row of followupsResult.data ?? []) {
    const taskId = row.star_task_id as string;
    followupsByTask.set(taskId, [...(followupsByTask.get(taskId) ?? []), row.message_id as string]);
  }
  const stars = (starsResult.data ?? []).map((row) => ({
    taskId: row.task_id as string,
    title: row.title as string,
    constellation: row.constellation_id ? nameById.get(row.constellation_id as string) ?? null : null,
    followupMessageIds: followupsByTask.get(row.task_id as string) ?? [],
  }));
  return { stars, constellations };
}

export async function linkStarFollowupInRoom(roomId: string, taskId: string, messageId: string): Promise<void> {
  const { supabase } = await getAuthenticatedRepository();
  const { error } = await supabase.from("room_star_followups").insert({
    room_id: roomId, star_task_id: taskId, message_id: messageId,
  });
  if (error) throw new Error("Could not link Star follow-up.");
}

export async function saveStarFallback(roomId: string, taskId: string, request: string): Promise<void> {
  const title = request.trim().replace(/\s+/g, " ").slice(0, 120) || "Untitled request";
  const { supabase } = await getAuthenticatedRepository();
  const { error } = await supabase.from("room_stars").upsert(
    { room_id: roomId, task_id: taskId, title },
    { onConflict: "task_id", ignoreDuplicates: true },
  );
  if (error) throw new Error("Could not save Star title.");
}

export async function renameStarInRoom(roomId: string, taskId: string, title: string): Promise<void> {
  const { supabase } = await getAuthenticatedRepository();
  const { data, error } = await supabase.from("room_stars").update({ title })
    .eq("room_id", roomId).eq("task_id", taskId).select("task_id").single();
  if (error || !data) throw new Error("Could not rename Star.");
}

export async function setStarGroupInRoom(roomId: string, taskId: string, groupName: string | null): Promise<void> {
  const { supabase } = await getAuthenticatedRepository();
  let constellationId: string | null = null;
  if (groupName) {
    const existing = await supabase.from("room_constellations").select("id")
      .eq("room_id", roomId).eq("name", groupName).maybeSingle();
    if (existing.error) throw new Error("Could not find Constellation.");
    if (existing.data) constellationId = existing.data.id as string;
    else {
      const created = await supabase.from("room_constellations")
        .insert({ room_id: roomId, name: groupName }).select("id").single();
      if (created.error || !created.data) throw new Error("Could not create Constellation.");
      constellationId = created.data.id as string;
    }
  }
  const { data, error } = await supabase.from("room_stars")
    .update({ constellation_id: constellationId }).eq("room_id", roomId)
    .eq("task_id", taskId).select("task_id").single();
  if (error || !data) throw new Error("Could not move Star.");
}

export async function renameGroupInRoom(roomId: string, currentName: string, nextName: string): Promise<void> {
  const { supabase } = await getAuthenticatedRepository();
  const { data, error } = await supabase.from("room_constellations")
    .update({ name: nextName, updated_at: new Date().toISOString() })
    .eq("room_id", roomId).eq("name", currentName).select("id").single();
  if (error || !data) throw new Error("Could not rename Constellation.");
}
