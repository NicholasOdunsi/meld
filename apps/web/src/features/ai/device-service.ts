import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hashToken,
  mintDeviceCredential,
  mintPairingCode,
  normalizePairingCode,
} from "@meld/device-auth";
import {
  ProviderSchema,
  ProviderStatusSchema,
  type Provider,
} from "@meld/contracts";
import { z } from "zod";

export const CreatePairingCodeInputSchema = z.object({
  requestedProvider: ProviderSchema,
});

export const RedeemPairingCodeInputSchema = z.object({
  code: z.string().trim().min(1).max(64),
  platform: z.string().trim().min(1).max(50),
  name: z.string().trim().max(100),
});

export type CreatePairingCodeInput = z.infer<
  typeof CreatePairingCodeInputSchema
>;
export type RedeemPairingCodeInput = z.infer<
  typeof RedeemPairingCodeInputSchema
>;

const ProviderConnectionSummarySchema = ProviderStatusSchema.extend({
  lastSeenAt: z.string().datetime().nullable(),
});

export const DeviceSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  platform: z.string(),
  status: z.enum(["active", "revoked"]),
  connectorVersion: z.string().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  providers: z.array(ProviderConnectionSummarySchema),
});

export type DeviceSummary = z.infer<typeof DeviceSummarySchema>;

export type DeviceServiceErrorCode =
  | "invalid_pairing_code"
  | "too_many_pairing_codes"
  | "invalid_execution_device"
  | "device_operation_failed";

export class DeviceServiceError extends Error {
  constructor(readonly code: DeviceServiceErrorCode) {
    super(code);
    this.name = "DeviceServiceError";
  }
}

function errorCode(error: unknown): DeviceServiceErrorCode {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : "";

  for (const code of [
    "invalid_pairing_code",
    "too_many_pairing_codes",
    "invalid_execution_device",
  ] as const) {
    if (message.includes(code)) {
      return code;
    }
  }

  return "device_operation_failed";
}

function serviceError(error: unknown) {
  return error instanceof DeviceServiceError
    ? error
    : new DeviceServiceError(errorCode(error));
}

function timestamp(value: unknown) {
  const parsed = z.string().datetime({ offset: true }).parse(value);
  return new Date(parsed).toISOString();
}

function nullableTimestamp(value: unknown) {
  return value === null ? null : timestamp(value);
}

const PAIRING_CODE_LIFETIME_MS = 10 * 60 * 1000;

export async function createPairingCode(
  supabase: SupabaseClient,
  input: CreatePairingCodeInput,
): Promise<{ code: string; createdAt: string; expiresAt: string }> {
  try {
    const minted = mintPairingCode();
    const { data, error } = await supabase.rpc(
      "create_device_pairing_code",
      {
        target_code_hash: minted.codeHash,
        target_requested_provider: input.requestedProvider,
      },
    );

    if (error || !data) {
      throw new DeviceServiceError(errorCode(error));
    }

    const expiresAt = timestamp(data);
    return {
      code: minted.code,
      // The RPC computes expiry from the same database transaction timestamp
      // used by the pairing row's created_at default. Deriving this boundary
      // avoids both app/DB clock skew and excluding a very fast redemption
      // that completes before this HTTP request returns.
      createdAt: new Date(
        new Date(expiresAt).getTime() - PAIRING_CODE_LIFETIME_MS,
      ).toISOString(),
      expiresAt,
    };
  } catch (error) {
    throw serviceError(error);
  }
}

export async function redeemPairingCode(
  supabase: SupabaseClient,
  input: RedeemPairingCodeInput,
): Promise<{
  deviceId: string;
  deviceToken: string;
  requestedProvider: Provider;
}> {
  try {
    const normalized = normalizePairingCode(input.code);
    const deviceId = randomUUID();
    const minted = mintDeviceCredential(deviceId);
    const { data, error } = await supabase.rpc(
      "redeem_device_pairing_code",
      {
        target_code_hash: hashToken(normalized),
        target_device_id: deviceId,
        target_token_hash: minted.tokenHash,
        target_platform: input.platform,
        target_name: input.name,
      },
    );

    if (error || !data) {
      throw new DeviceServiceError(errorCode(error));
    }

    const result = z
      .array(z.object({ requested_provider: ProviderSchema }))
      .min(1)
      .parse(data)[0];
    const deviceToken = minted.credential.split(".")[1];

    if (!result || !deviceToken) {
      throw new Error("Invalid redemption result");
    }

    return {
      deviceId,
      deviceToken,
      requestedProvider: result.requested_provider,
    };
  } catch (error) {
    throw serviceError(error);
  }
}

export async function listDevices(
  supabase: SupabaseClient,
): Promise<DeviceSummary[]> {
  try {
    const { data, error } = await supabase.rpc(
      "list_execution_devices",
    );

    if (error || !data) {
      throw new DeviceServiceError(errorCode(error));
    }

    return z.array(z.record(z.string(), z.unknown())).parse(data).map(
      (device) =>
        DeviceSummarySchema.parse({
          id: device.id,
          name: device.name,
          platform: device.platform,
          status: device.status,
          connectorVersion: device.connector_version,
          lastSeenAt: nullableTimestamp(device.last_seen_at),
          createdAt: timestamp(device.created_at),
          providers: z
            .array(z.record(z.string(), z.unknown()))
            .parse(device.providers)
            .map((provider) => ({
              ...provider,
              lastSeenAt: nullableTimestamp(provider.lastSeenAt),
            })),
        }),
    );
  } catch (error) {
    throw serviceError(error);
  }
}

export async function revokeDevice(
  supabase: SupabaseClient,
  deviceId: string,
): Promise<void> {
  try {
    const { error } = await supabase.rpc(
      "revoke_execution_device",
      {
        target_device_id: deviceId,
      },
    );

    if (error) {
      throw new DeviceServiceError(errorCode(error));
    }
  } catch (error) {
    throw serviceError(error);
  }
}
