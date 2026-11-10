import type { InspirationLabels } from "@meld/contracts";
import { authenticateShelfRequest } from "@/features/inspiration/shelf-auth";
import { shelfError } from "@/features/inspiration/shelf-responses";
import {
  createFakeShelfTaste,
  createShelfTaste,
  libraryLabels as fetchLibraryLabels,
  type ShelfTaste,
  type ShelfTasteError,
} from "@/features/inspiration/shelf-taste";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

export type TasteRequestContext = {
  taste: ShelfTaste;
  libraryLabels: (itemIds: string[]) => Promise<{ name: string; labels: InspirationLabels }[]>;
};

// Token → the right taste service (real or demo), or the error response to send.
export async function tasteForRequest(request: Request): Promise<TasteRequestContext | { response: Response }> {
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
  if (isRoomFakeEnabled()) {
    return { taste: createFakeShelfTaste(principal), libraryLabels: async () => [] };
  }
  return {
    taste: createShelfTaste(supabase, principal),
    libraryLabels: (ids) => fetchLibraryLabels(supabase, principal.workspaceId, ids),
  };
}

export function tasteError(error: ShelfTasteError | "conflict"): Response {
  return error === "conflict" ? Response.json({ status: "conflict" }, { status: 409 }) : shelfError(error);
}
