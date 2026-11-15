import "server-only";

import { after } from "next/server";
import { z } from "zod";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

const suggestionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  constellation: z.string().trim().min(1).max(80).nullable(),
  relatedTaskIds: z.array(z.string().uuid()).max(10),
});

// Metadata is optional. A queued reply already has a fallback Star title;
// enrichment runs after the response and cannot delay or roll back the post.
export function scheduleStarEnrichment(roomId: string, taskId: string, request: string): void {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || !request.trim()) return;
  const fallbackTitle = request.trim().replace(/\s+/g, " ").slice(0, 120);
  after(async () => {
    try {
      const client = createShelfServerClient();
      const [groups, stars] = await Promise.all([
        client.from("room_constellations").select("id,name").eq("room_id", roomId),
        client.from("room_stars").select("task_id,title,constellation_id").eq("room_id", roomId),
      ]);
      if (groups.error || stars.error) return;
      const names = (groups.data ?? []).map((row) => row.name as string);
      const ungrouped = (stars.data ?? []).filter((row) => row.task_id !== taskId && !row.constellation_id)
        .map((row) => ({ taskId: row.task_id as string, title: row.title as string }));
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_TEXT_MODEL || "deepseek-flash",
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Name one work item. Return JSON with a short title (3-8 words), constellation, and relatedTaskIds. Use an existing constellation name exactly when related. If the request closely matches one or more ungrouped Stars, suggest a new 2-5 word constellation and list their exact task IDs in relatedTaskIds. Otherwise constellation must be null and relatedTaskIds empty. Never create a group for one unrelated Star. No extra fields." },
            { role: "user", content: JSON.stringify({ request: request.slice(0, 1000), existingConstellations: names, ungroupedStars: ungrouped.slice(0, 40) }) },
          ],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) return;
      const body = await response.json() as { choices?: { message?: { content?: string } }[] };
      const suggestion = suggestionSchema.parse(JSON.parse(body.choices?.[0]?.message?.content ?? ""));
      let constellationId: string | null = null;
      const knownIds = new Set(ungrouped.map((item) => item.taskId));
      const related = suggestion.relatedTaskIds.filter((id) => knownIds.has(id));
      if (suggestion.constellation) {
        const found = await client.from("room_constellations").select("id")
          .eq("room_id", roomId).eq("name", suggestion.constellation).maybeSingle();
        if (found.error) return;
        if (found.data) constellationId = found.data.id as string;
        else if (related.length > 0) {
          const created = await client.from("room_constellations")
            .insert({ room_id: roomId, name: suggestion.constellation }).select("id").single();
          if (created.error || !created.data) return;
          constellationId = created.data.id as string;
        }
      }
      const result = await client.from("room_stars").update({ title: suggestion.title,
        constellation_id: constellationId, updated_at: new Date().toISOString() })
        .eq("room_id", roomId).eq("task_id", taskId)
        .eq("title", fallbackTitle).is("constellation_id", null).select("task_id");
      if (result.error || !result.data?.length || !constellationId || related.length === 0) return;
      await client.from("room_stars").update({ constellation_id: constellationId,
        updated_at: new Date().toISOString() }).eq("room_id", roomId)
        .in("task_id", related).is("constellation_id", null);
    } catch { /* Keep the fallback title and ungrouped Star. */ }
  });
}
