import { authenticateShelfRequest } from "@/features/inspiration/shelf-auth";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { createFakeShelfTaste, createShelfTaste, type ShelfTaste, type ShelfTasteError } from "@/features/inspiration/shelf-taste";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

// Token → the right taste service (real or demo), or the error response to send.
export async function tasteForRequest(request: Request): Promise<{ taste: ShelfTaste } | { response: Response }> {
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
  return { taste: isRoomFakeEnabled() ? createFakeShelfTaste(principal) : createShelfTaste(supabase, principal) };
}

export function tasteError(error: ShelfTasteError | "conflict"): Response {
  return error === "conflict" ? Response.json({ status: "conflict" }, { status: 409 }) : shelfError(error);
}
