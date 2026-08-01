import "server-only";

import { randomUUID } from "node:crypto";
import type { Provider } from "@meld/contracts";
import type { AgentReadiness } from "./agent-readiness";
import type { DeviceSummary } from "./device-service";
import type { ProviderSetupView } from "./provider-setup-service";

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

// A fake managed provider setup the /api/devices/provider-setups routes serve in
// E2E mode. The real routes reach create_provider_setup_request and a durable
// row the connector drives; here there is no connector, so this store stands in
// for one: each poll of a live setup advances it installing -> authenticating ->
// verifying -> completed, exactly the stage order ProviderSetup reports.
type FakeSetupRecord = { view: ProviderSetupView; ticks: number };

const FAKE_SETUP_STORE_KEY = Symbol.for("meld.e2e-provider-setups");

function setupStore(): Map<string, FakeSetupRecord> {
  const globalState = globalThis as typeof globalThis & {
    [FAKE_SETUP_STORE_KEY]?: Map<string, FakeSetupRecord>;
  };
  globalState[FAKE_SETUP_STORE_KEY] ??= new Map();
  return globalState[FAKE_SETUP_STORE_KEY];
}

const SETUP_PROGRESSION: {
  status: ProviderSetupView["status"];
  stage: ProviderSetupView["stage"];
  progressMessage: string | null;
}[] = [
  { status: "installing", stage: "installing", progressMessage: "Installing" },
  {
    status: "authenticating",
    stage: "authenticating",
    progressMessage: "Waiting for the provider login",
  },
  { status: "verifying", stage: "verifying", progressMessage: "Verifying" },
  { status: "completed", stage: null, progressMessage: null },
];

export function fakeCreateProviderSetup(input: {
  deviceId: string;
  provider: Provider;
}): ProviderSetupView {
  const first = SETUP_PROGRESSION[0]!;
  const view: ProviderSetupView = {
    id: randomUUID(),
    deviceId: input.deviceId,
    provider: input.provider,
    status: first.status,
    stage: first.stage,
    progressMessage: first.progressMessage,
    errorCode: null,
    errorMessage: null,
    updatedAt: new Date().toISOString(),
  };
  setupStore().set(view.id, { view, ticks: 0 });
  return view;
}

export function fakeGetProviderSetup(id: string): ProviderSetupView | null {
  const record = setupStore().get(id);
  if (!record) {
    return null;
  }
  const nextIndex = Math.min(record.ticks + 1, SETUP_PROGRESSION.length - 1);
  const step = SETUP_PROGRESSION[nextIndex]!;
  record.ticks = nextIndex;
  record.view = {
    ...record.view,
    status: step.status,
    stage: step.stage,
    progressMessage: step.progressMessage,
    updatedAt: new Date().toISOString(),
  };
  return record.view;
}

export function fakeListActiveProviderSetups(): ProviderSetupView[] {
  const terminal = new Set(["completed", "failed", "cancelled"]);
  return [...setupStore().values()]
    .map((record) => record.view)
    .filter((view) => !terminal.has(view.status));
}
