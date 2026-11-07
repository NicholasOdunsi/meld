import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ShelfSettingsView } from "@/features/inspiration/components/shelf-settings-view";
import { listShelfTokens } from "@/features/inspiration/shelf-connection";
import { SettingsTabs } from "@/features/workspaces/settings-tabs";

export default async function ShelfSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const tokens = await listShelfTokens(workspaceId);

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <VStack gap={1} paddingInline={6} paddingBlock={4}>
            <Heading level={1}>Shelf</Heading>
            <Text type="supporting">Save images into Orion from anywhere on your Mac.</Text>
          </VStack>
          <HStack paddingInline={6}>
            <SettingsTabs workspaceId={workspaceId} />
          </HStack>
        </LayoutHeader>
      }
    >
      <LayoutContent padding={0}>
        <Section variant="transparent" padding={6}>
          <ShelfSettingsView workspaceId={workspaceId} initialTokens={tokens} />
        </Section>
      </LayoutContent>
    </Layout>
  );
}
