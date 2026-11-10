import { createFakeShelfLibrary, createShelfLibrary, type ShelfLibrary, type ShelfLibraryError } from "@/features/inspiration/shelf-library";
import { authenticateShelfRequest } from "@/features/inspiration/shelf-auth";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

// Token → the right library (real or demo), or the error response to send.
export async function libraryForRequest(request: Request): Promise<{ library: ShelfLibrary } | { response: Response }> {
  let supabase: ReturnType<typeof createShelfServerClient>;
  try {
    supabase = createShelfServerClient();
  } catch {
    if (!isRoomFakeEnabled()) {
      console.error("Shelf server configuration error");
      return { response: shelfError("unavailable") };
    }
    supabase = {} as ReturnType<typeof createShelfServerClient>;
  }
  const principal = await authenticateShelfRequest(request, supabase);
  if (!principal) return { response: shelfError("unauthorized") };
  return { library: isRoomFakeEnabled() ? createFakeShelfLibrary(principal) : createShelfLibrary(supabase, principal) };
}

export function libraryError(error: ShelfLibraryError): Response {
  return shelfError(error);
}
