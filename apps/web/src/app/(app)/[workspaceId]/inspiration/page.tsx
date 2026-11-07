import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { InspirationLibraryView } from "@/features/inspiration/components/inspiration-library-view";
import { listLibrary } from "@/features/inspiration/inspiration-reader";
import { scheduleInspirationSort } from "@/features/inspiration/sorting/schedule-inspiration-sort";

export default async function InspirationPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ item?: string | string[] }>;
}) {
  const { workspaceId } = await params;
  const { item } = await searchParams;
  const initialPage = await listLibrary({ workspaceId, offset: 0 });
  // Picks up the one-time backfill and anything that failed to sort earlier.
  const userId = isRoomFakeEnabled()
    ? undefined
    : (await (await createClient(new Headers())).auth.getUser()).data.user?.id;
  scheduleInspirationSort(workspaceId, userId);
  // `?item=<id>` (sent by the shelf's recent thumbnails) opens that image.
  const initialOpenItemId = typeof item === "string" ? item : null;

  return (
    <InspirationLibraryView
      workspaceId={workspaceId}
      initialPage={initialPage}
      initialOpenItemId={initialOpenItemId}
    />
  );
}
