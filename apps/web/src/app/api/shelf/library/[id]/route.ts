import { ShelfNoteRequestSchema } from "@meld/contracts";
import { z } from "zod";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { libraryError, libraryForRequest } from "../library-for-request";
import { readJson } from "../request-json";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const resolved = await libraryForRequest(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  const body = await readJson(request, ShelfNoteRequestSchema);
  if (!z.string().uuid().safeParse(id).success || !body) return shelfError("invalid_request");
  const result = await resolved.library.updateNote(id, body.note);
  return result.ok ? Response.json(result.value) : libraryError(result.error);
}
