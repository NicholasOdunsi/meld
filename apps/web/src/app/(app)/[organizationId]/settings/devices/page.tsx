import { Heading } from "@astryxdesign/core/Heading";
import {
  Layout,
  LayoutContent,
  LayoutHeader,
} from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ConnectDevice } from "@/features/ai/components/connect-device";
import { DeviceList } from "@/features/ai/components/device-list";
import { listDevices } from "@/features/ai/device-service";
import { isDeviceFakeEnabled } from "@/features/ai/e2e-gate";
import { createClient } from "@/lib/supabase/server";

async function loadDevices() {
  if (isDeviceFakeEnabled()) {
    const fake = await import("@/features/ai/e2e-fake");
    return {
      devices: fake.listFakeDevices(),
      fakePairingCode: fake.FIXED_PAIRING_CODE,
      isFake: true,
    };
  }

  const supabase = await createClient(new Headers());
  return {
    devices: await listDevices(supabase),
    fakePairingCode: undefined,
    isFake: false,
  };
}

export default async function DevicesPage() {
  const { devices, fakePairingCode, isFake } = await loadDevices();

  // An already-paired Mac adds a second provider to its existing device via
  // create_provider_setup_request; only a Mac with no active device pairs. This
  // keeps re-pairing (the single-Mac replace path) off the add-a-provider flow,
  // so connecting Claude never revokes the device Codex is running on.
  const activeDevices = devices
    .filter((device) => device.status === "active")
    .map((device) => ({ id: device.id, name: device.name }));

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <VStack gap={1} paddingInline={6} paddingBlock={4}>
            <Heading level={1}>AI connections</Heading>
            <Text type="supporting">
              Connect a Mac and manage the devices that can run AI tasks.
            </Text>
          </VStack>
        </LayoutHeader>
      }
    >
      <LayoutContent padding={0}>
        <VStack gap={0} width="100%">
          <Section
            variant="transparent"
            padding={6}
            dividers={["bottom"]}
          >
            <ConnectDevice
              devices={activeDevices}
              fakePairingCode={fakePairingCode}
            />
          </Section>
          <Section variant="transparent" padding={6}>
            <VStack gap={1}>
              <Heading level={2}>Connected devices</Heading>
              <Text type="supporting">
                Revoking a device stops it from running new tasks.
              </Text>
            </VStack>
          </Section>
          <DeviceList devices={devices} isFake={isFake} />
        </VStack>
      </LayoutContent>
    </Layout>
  );
}
