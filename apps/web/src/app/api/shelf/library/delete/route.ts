import { ShelfItemIdsRequestSchema } from "@meld/contracts";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { libraryError, libraryForRequest } from "../library-for-request";
import { readJson } from "../request-json";

export async function POST(request: Request) {
  const resolved = await libraryForRequest(request);
  if ("response" in resolved) return resolved.response;
  const body = await readJson(request, ShelfItemIdsRequestSchema);
  if (!body) return shelfError("invalid_request");
  const result = await resolved.library.remove(body.ids);
  return result.ok ? Response.json(result.value) : libraryError(result.error);
}
