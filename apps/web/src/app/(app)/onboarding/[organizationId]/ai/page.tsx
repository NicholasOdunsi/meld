import { AIConnectionSetup } from "@/features/ai/components/ai-connection-setup";
import { listDevices } from "@/features/ai/device-service";
import { isDeviceFakeEnabled } from "@/features/ai/e2e-gate";
import { requireOrganizationMembership } from "@/features/workspaces/organization-people";
import { createClient } from "@/lib/supabase/server";

async function loadActiveDevices() {
  if (isDeviceFakeEnabled()) {
    const fake = await import("@/features/ai/e2e-fake");
    return {
      devices: fake.listFakeDevices(),
      fakePairingCode: fake.FIXED_PAIRING_CODE,
    };
  }

  const supabase = await createClient(new Headers());
  return {
    devices: await listDevices(supabase),
    fakePairingCode: undefined,
  };
}

export default async function AIConnectionOnboardingPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;
  await requireOrganizationMembership(
    organizationId,
    `/onboarding/${organizationId}/ai`,
  );

  const { devices, fakePairingCode } = await loadActiveDevices();
  const activeDevices = devices
    .filter((device) => device.status === "active")
    .map((device) => ({ id: device.id, name: device.name }));

  return (
    <AIConnectionSetup
      organizationId={organizationId}
      devices={activeDevices}
      fakePairingCode={fakePairingCode}
    />
  );
}
