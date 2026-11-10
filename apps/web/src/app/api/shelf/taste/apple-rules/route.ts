import { ShelfAppleRulesRequestSchema } from "@meld/contracts";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { readJson } from "@/app/api/shelf/library/request-json";
import { tasteError, tasteForRequest } from "../taste-for-request";

export async function PUT(request: Request) {
  const resolved = await tasteForRequest(request);
  if ("response" in resolved) return resolved.response;
  const body = await readJson(request, ShelfAppleRulesRequestSchema);
  if (!body) return shelfError("invalid_request");
  const result = await resolved.taste.setAppleRules(body.enabled);
  return result.ok ? Response.json(result.value) : tasteError(result.error);
}
