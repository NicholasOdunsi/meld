import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { tasteError, tasteForRequest } from "./taste-for-request";

export async function GET(request: Request) {
  const resolved = await tasteForRequest(request);
  if ("response" in resolved) return resolved.response;
  const result = await resolved.taste.get();
  if (!result.ok) return tasteError(result.error);
  // Demo mode has no DeepSeek key but still serves deterministic composer cards.
  const composerEnabled = Boolean(process.env.DEEPSEEK_API_KEY) || isRoomFakeEnabled();
  // No board yet: the app shows "Orion is still learning".
  return Response.json(
    result.value ? { status: "ready", ...result.value, composerEnabled } : { status: "learning", composerEnabled },
  );
}
