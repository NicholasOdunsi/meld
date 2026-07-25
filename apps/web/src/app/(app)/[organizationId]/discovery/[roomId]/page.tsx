import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { notFound } from "next/navigation";
import { getDiscoveryRoomPageData } from "@/features/discovery/actions";
import { Conversation } from "@/features/discovery/components/conversation";
import { DiscoveryRoomHeader } from "@/features/discovery/components/discovery-room-header";
import { isDiscoveryFakeEnabled } from "@/features/discovery/e2e-gate";

export default async function DiscoveryRoomPage({
  params,
}: {
  params: Promise<{ organizationId: string; roomId: string }>;
}) {
  const { organizationId, roomId } = await params;
  const data = await getDiscoveryRoomPageData({
    organizationId,
    roomId,
  });
  if (!data) notFound();
  // Responsive contract:
  //   > 768px  dashboard navigation | conversation
  //   <= 768px  dashboard navigation uses AppShell mobile navigation
  return (
    <Layout
      height="fill"
      style={{ backgroundColor: "var(--color-background-body)" }}
      header={
        <LayoutHeader
          hasDivider
          padding={3}
          style={{ backgroundColor: "var(--color-background-body)" }}
        >
          <DiscoveryRoomHeader
            roomName={data.room.name}
            currentUserId={data.currentUser.id}
            participants={data.participants}
          />
        </LayoutHeader>
      }
    >
      <LayoutContent
        padding={0}
        data-testid="discovery-room-surface"
        style={{ backgroundColor: "var(--color-background-body)" }}
      >
        <Conversation
          roomId={roomId}
          currentUserId={data.currentUser.id}
          currentUserName={data.currentUser.name}
          initialMessages={data.messages}
          realtimeMode={
            isDiscoveryFakeEnabled()
              ? "development-poll"
              : "production"
          }
        />
      </LayoutContent>
    </Layout>
  );
}
