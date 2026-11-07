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
  scheduleInspirationSort(workspaceId);
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
