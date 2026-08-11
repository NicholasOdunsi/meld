import { AIConnectionSetup } from "@/features/ai/components/ai-connection-setup";
import { listDevices } from "@/features/ai/device-service";
import { isDeviceFakeEnabled } from "@/features/ai/e2e-gate";
import { requireWorkspaceMembership } from "@/features/workspaces/workspace-people";
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
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  await requireWorkspaceMembership(
    workspaceId,
    `/onboarding/${workspaceId}/ai`,
  );

  const { devices, fakePairingCode } = await loadActiveDevices();
  const activeDevices = devices
    .filter((device) => device.status === "active")
    .map((device) => ({ id: device.id, name: device.name }));

  return (
    <AIConnectionSetup
      workspaceId={workspaceId}
      devices={activeDevices}
      fakePairingCode={fakePairingCode}
    />
  );
}
