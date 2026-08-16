import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Provider, ProviderStatus } from "@meld/contracts";
import { listDevices, type DeviceSummary } from "./device-service";

// A provider connection the Product Agent can actually run against right now.
// This mirrors, verbatim, the three-way gate create_room_reply_task enforces
// server side (installed + authenticated + supported), so readiness the
// composer shows never promises a reply the RPC would then refuse.
export type ReadyProvider = {
  provider: Provider;
  deviceId: string;
  deviceName: string;
  models?: string[];
  defaultModel?: string;
};

export type AgentReadiness =
  | {
      ready: true;
      defaultProvider: Provider;
      defaultDeviceId: string;
      providers: ReadyProvider[];
    }
  | {
      ready: false;
      reason: "no_device" | "offline" | "signed_out" | "unsupported";
    };

function isReadyConnection(connection: ProviderStatus): boolean {
  return (
    connection.installation === "installed" &&
    connection.authentication === "authenticated" &&
    connection.compatibility === "supported"
  );
}

// Reason precedence, evaluated ONLY when the default device carries no runnable
// provider (the ready path has already returned). Each reason names the state it
// is actually in, so the composer can route to the exact fix:
//
//   1. signed_out  -- a provider is installed and supported but not
//                     authenticated: fixable in the provider's own tool.
//   2. unsupported -- a provider is installed but its build is not supported.
//   3. offline     -- no installed provider is reporting at all (empty, or only
//                     not_installed / installing / failed): the connector has
//                     not contributed a usable install, i.e. the device is not
//                     currently reachable for the agent.
//
// Because this is unreachable while any provider is ready, `offline` is never
// returned for an online device that merely has an unready *default* provider
// alongside a ready one -- that case is `ready: true`; and a default that is
// specifically signed out or unsupported returns those reasons, not `offline`.
function blockingReason(
  connections: ProviderStatus[],
): "offline" | "signed_out" | "unsupported" {
  if (
    connections.some(
      (connection) =>
        connection.installation === "installed" &&
        connection.compatibility === "supported" &&
        connection.authentication !== "authenticated",
    )
  ) {
    return "signed_out";
  }

  if (
    connections.some(
      (connection) =>
        connection.installation === "installed" &&
        connection.compatibility !== "supported",
    )
  ) {
    return "unsupported";
  }

  return "offline";
}

// Resolve whether a Product Agent mention can be queued from an authenticated
// session, and, when it can, which providers a per-task picker may offer.
//
// Every input comes from authenticated Supabase reads made with this request's
// client -- list_execution_devices (RLS-scoped) and the caller's own
// ai_user_preferences row (RLS-scoped). Nothing is inferred from stale client
// state: a device revoked or a provider signed out between page load and send
// is reflected here because this reads the live rows.
//
// The device is always the saved default device (create_room_reply_task
// resolves it the same way and cannot be overridden), so the offered providers
// are the runnable connections ON that device. The override only swaps the
// provider, never the device -- offering a provider from another device would
// promise a reply the RPC would reject.
//
// Readiness gates on "at least one provider is runnable on the default device",
// NOT on the saved default provider specifically. A user whose default is
// rate-limited or signed out but who has another ready provider on the device
// is still ready: the picker simply defaults to a ready provider and the
// mention queues against it (create_room_reply_task accepts that provider as an
// override). Gating on the default alone would dead-end such a user to setup.
export async function resolveAgentReadiness(
  supabase: SupabaseClient,
): Promise<AgentReadiness> {
  const [devices, preference] = await Promise.all([
    listDevices(supabase),
    readDefaultPreference(supabase),
  ]);

  const activeDevices = devices.filter(
    (device) => device.status === "active",
  );

  const defaultDevice =
    preference === null
      ? null
      : activeDevices.find(
          (device) => device.id === preference.defaultDeviceId,
        ) ?? null;

  if (preference === null || defaultDevice === null) {
    return { ready: false, reason: "no_device" };
  }

  const readyProviders = readyProvidersOnDevice(defaultDevice);

  if (readyProviders.length === 0) {
    return {
      ready: false,
      reason: blockingReason(defaultDevice.providers),
    };
  }

  // Default to the saved preference when it is itself runnable; otherwise fall
  // back deterministically to the first ready provider in the device's stable
  // order. Either way the default is guaranteed to be a provider the picker can
  // queue against.
  const defaultProvider = readyProviders.some(
    (candidate) => candidate.provider === preference.defaultProvider,
  )
    ? preference.defaultProvider
    : readyProviders[0].provider;

  return {
    ready: true,
    defaultProvider,
    defaultDeviceId: preference.defaultDeviceId,
    providers: readyProviders,
  };
}

function readyProvidersOnDevice(device: DeviceSummary): ReadyProvider[] {
  return device.providers.filter(isReadyConnection).map((connection) => ({
    provider: connection.provider,
    deviceId: device.id,
    deviceName: device.name,
    ...(connection.models?.length ? { models: connection.models } : {}),
    ...(connection.defaultModel
      ? { defaultModel: connection.defaultModel }
      : {}),
  }));
}

type DefaultPreference = {
  defaultDeviceId: string;
  defaultProvider: Provider;
};

// The caller's saved default, read directly under RLS ("Users can view their
// AI preferences"). ai_user_preferences forbids "half a default" at the DB
// level, so device and provider are both present or both absent; a partial row
// therefore reads as no default.
async function readDefaultPreference(
  supabase: SupabaseClient,
): Promise<DefaultPreference | null> {
  const { data, error } = await supabase
    .from("ai_user_preferences")
    .select("default_device_id, default_provider")
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const deviceId = data.default_device_id;
  const provider = data.default_provider;
  if (typeof deviceId !== "string" || typeof provider !== "string") {
    return null;
  }

  return {
    defaultDeviceId: deviceId,
    defaultProvider: provider as Provider,
  };
}
