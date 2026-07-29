import "server-only";

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
