import { z } from "zod";
import type { SketchRequest } from "./sketch-request";

const Reply = z.object({ screenId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), html: z.string().min(1) });

export async function postSketch(
  request: SketchRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ screenId: string; html: string }> {
  const response = await fetchImpl("/api/dev/canvas-excalidraw/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = json && typeof json === "object" && "error" in json ? String((json as { error: unknown }).error) : "failed";
    throw new Error(message);
  }
  const parsed = Reply.safeParse(json);
  if (!parsed.success) throw new Error("malformed reply");
  return parsed.data;
}
