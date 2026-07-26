import { Heading } from "@astryxdesign/core/Heading";
import {
  Layout,
  LayoutContent,
} from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { listDiscoveryRooms } from "@/features/discovery/actions";
import { listAttentionItems } from "@/features/home/actions";
import { NeedsAttention } from "@/features/home/components/needs-attention";
import { StartingPoints } from "@/features/home/components/starting-points";

const CONTENT_MAX_WIDTH = "calc(var(--spacing-12) * 20)";
// Matches the discovery room conversation page's background override
// (apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx),
// which breaks from the AppShell's default surface color.
const CONTENT_BACKGROUND = "var(--color-background-body)";

export default async function HomePage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  const rooms = await listDiscoveryRooms(organizationId);
  // Every attention kind is anchored to a room, so an organization with no
  // rooms cannot have anything needing attention — skip the query rather
  // than fetch a result that is guaranteed empty.
  const attentionItems =
    rooms.length > 0 ? await listAttentionItems(organizationId) : [];

  return (
    <Layout
      height="fill"
      contentWidth={CONTENT_MAX_WIDTH}
      style={{ backgroundColor: CONTENT_BACKGROUND }}
    >
      <LayoutContent
        padding={10}
        style={{ backgroundColor: CONTENT_BACKGROUND }}
      >
        <VStack
          gap={8}
          width="100%"
          style={{ paddingBlockStart: "var(--spacing-10)" }}
        >
          <Heading level={1}>What are you building?</Heading>
          <StartingPoints organizationId={organizationId} />
          <NeedsAttention items={attentionItems} />
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
