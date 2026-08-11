import { Heading } from "@astryxdesign/core/Heading";
import {
  Layout,
  LayoutContent,
} from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { listRooms } from "@/features/rooms/queries";
import { listAttentionItems } from "@/features/home/actions";
import { NeedsAttention } from "@/features/home/components/needs-attention";
import { StartingPoints } from "@/features/home/components/starting-points";

const CONTENT_MAX_WIDTH = "calc(var(--spacing-12) * 20)";
// Matches the room conversation page's background override
// (apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx),
// which breaks from the AppShell's default surface color.
const CONTENT_BACKGROUND = "var(--color-background-body)";

export default async function HomePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const rooms = await listRooms(workspaceId);
  // Every attention kind is anchored to a room, so a workspace with no
  // rooms cannot have anything needing attention — skip the query rather
  // than fetch a result that is guaranteed empty.
  const attentionItems =
    rooms.length > 0 ? await listAttentionItems(workspaceId) : [];

  return (
    <Layout
      height="fill"
      contentWidth={CONTENT_MAX_WIDTH}
      style={{ backgroundColor: CONTENT_BACKGROUND }}
    >
      <LayoutContent
        padding={10}
        style={{
          backgroundColor: CONTENT_BACKGROUND,
          paddingInlineStart: "var(--spacing-12)",
          paddingInlineEnd: "var(--spacing-12)",
        }}
      >
        <VStack
          gap={8}
          width="100%"
          style={{ paddingBlockStart: "var(--spacing-10)" }}
        >
          <Heading level={1}>What are you building?</Heading>
          <StartingPoints workspaceId={workspaceId} />
          <NeedsAttention items={attentionItems} />
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
