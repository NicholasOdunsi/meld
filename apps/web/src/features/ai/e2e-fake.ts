import "server-only";

import type { AgentReadiness } from "./agent-readiness";
import type { DeviceSummary } from "./device-service";

export const FIXED_PAIRING_CODE = "MELD2026";

const FAKE_DEVICES: DeviceSummary[] = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    name: "Ada's MacBook",
    platform: "macOS 15.6",
    status: "active",
    connectorVersion: "0.1.0",
    lastSeenAt: "2026-07-29T09:45:00.000Z",
    createdAt: "2026-07-28T12:00:00.000Z",
    providers: [
      {
        provider: "claude",
        installation: "installed",
        version: "1.0.40",
        authentication: "authenticated",
        compatibility: "supported",
        lastSeenAt: "2026-07-29T09:44:00.000Z",
      },
      {
        provider: "codex",
        installation: "installed",
        version: "0.20.0",
        authentication: "authenticated",
        compatibility: "supported",
        lastSeenAt: "2026-07-29T09:44:00.000Z",
      },
    ],
  },
];

export function listFakeDevices(): DeviceSummary[] {
  return FAKE_DEVICES.map((device) => ({
    ...device,
    providers: device.providers.map((provider) => ({ ...provider })),
  }));
}

// The composer readiness the room preflight resolves in E2E mode. It mirrors the
// three-way ready gate against the fake device above, so the picker offers
// exactly the providers that device reports installed, authenticated, and
// supported (both codex and claude), defaulting to codex. Kept here so the fake
// readiness and the fake device can never drift apart.
export function fakeAgentReadiness(): AgentReadiness {
  const device = FAKE_DEVICES[0];
  if (!device) {
    return { ready: false, reason: "no_device" };
  }
  const providers = device.providers
    .filter(
      (provider) =>
        provider.installation === "installed" &&
        provider.authentication === "authenticated" &&
        provider.compatibility === "supported",
    )
    .map((provider) => ({
      provider: provider.provider,
      deviceId: device.id,
      deviceName: device.name,
    }));

  if (providers.length === 0) {
    return { ready: false, reason: "offline" };
  }

  return {
    ready: true,
    defaultProvider: providers[0]!.provider,
    defaultDeviceId: device.id,
    providers,
  };
}
