import { ShelfTasteResetRequestSchema } from "@meld/contracts";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { readJson } from "@/app/api/shelf/library/request-json";
import { tasteError, tasteForRequest } from "../taste-for-request";

export async function POST(request: Request) {
  const resolved = await tasteForRequest(request);
  if ("response" in resolved) return resolved.response;
  const body = await readJson(request, ShelfTasteResetRequestSchema);
  if (!body) return shelfError("invalid_request");
  const result = await resolved.taste.resetTile(body.tile);
  return result.ok ? Response.json(result.value) : tasteError(result.error);
}
