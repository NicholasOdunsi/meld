import { ShelfTasteDecisionRequestSchema } from "@meld/contracts";
import { z } from "zod";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { readJson } from "@/app/api/shelf/library/request-json";
import { tasteError, tasteForRequest } from "@/app/api/shelf/taste/taste-for-request";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await tasteForRequest(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  const body = await readJson(request, ShelfTasteDecisionRequestSchema);
  if (!z.string().uuid().safeParse(id).success || !body) return shelfError("invalid_request");
  const result = await resolved.taste.decide({ suggestionId: id, ...body });
  return result.ok ? Response.json(result.value) : tasteError(result.error);
}
