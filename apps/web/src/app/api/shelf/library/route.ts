import { libraryError, libraryForRequest } from "./library-for-request";

export async function GET(request: Request) {
  const resolved = await libraryForRequest(request);
  if ("response" in resolved) return resolved.response;
  const raw = Number(new URL(request.url).searchParams.get("offset") ?? "0");
  const offset = Number.isInteger(raw) && raw >= 0 ? raw : 0;
  const result = await resolved.library.list(offset);
  return result.ok ? Response.json(result.value) : libraryError(result.error);
}
