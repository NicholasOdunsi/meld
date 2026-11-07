import { InspirationLibraryView } from "@/features/inspiration/components/inspiration-library-view";
import { listLibrary } from "@/features/inspiration/inspiration-reader";

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
