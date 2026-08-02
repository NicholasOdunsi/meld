import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ProviderSchema,
  ProviderSetupErrorCodeSchema,
  ProviderSetupStageSchema,
  ProviderSetupStatusSchema,
  type Provider,
  type ProviderSetupErrorCode,
  type ProviderSetupStage,
  type ProviderSetupStatus,
} from "@meld/contracts";
import { z } from "zod";

export const CreateProviderSetupInputSchema = z.object({
  deviceId: z.string().uuid(),
  provider: ProviderSchema,
});

export type CreateProviderSetupInput = z.infer<
  typeof CreateProviderSetupInputSchema
>;

// The single durable projection the web app renders and polls. Every key
// here is server-owned status metadata: no provider install paths, no device
// credentials, nothing the connector keeps in the Keychain or on disk.
export type ProviderSetupView = {
  id: string;
  deviceId: string;
  provider: Provider;
  status: ProviderSetupStatus;
  stage: ProviderSetupStage | null;
  progressMessage: string | null;
  errorCode: ProviderSetupErrorCode | null;
  errorMessage: string | null;
  updatedAt: string;
};

// Pins exactly the camelCase keys Task 2's RPC returns and the direct SELECT
// is mapped onto, dropping the owner id, timestamps, and completion marker the
// UI never needs.
const ProviderSetupViewSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  provider: ProviderSchema,
  status: ProviderSetupStatusSchema,
  stage: ProviderSetupStageSchema.nullable(),
  progressMessage: z.string().nullable(),
  errorCode: ProviderSetupErrorCodeSchema.nullable(),
  errorMessage: z.string().nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});

export type ProviderSetupServiceErrorCode =
  | "not_found"
  | "provider_setup_failed";

export class ProviderSetupServiceError extends Error {
  constructor(readonly code: ProviderSetupServiceErrorCode) {
    super(code);
    this.name = "ProviderSetupServiceError";
  }
}

function errorCode(error: unknown): ProviderSetupServiceErrorCode {
  const message =
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
      ? error.message
      : "";

  // Unknown/other-owner/revoked device all raise this one message on purpose,
  // so a probing caller learns only "not found", never which of the three.
  if (message.includes("invalid_provider_setup_request")) {
    return "not_found";
  }

  return "provider_setup_failed";
}

function serviceError(error: unknown) {
  return error instanceof ProviderSetupServiceError
    ? error
    : new ProviderSetupServiceError(errorCode(error));
}

export function parseProviderSetupView(raw: unknown): ProviderSetupView {
  const parsed = ProviderSetupViewSchema.parse(raw);
  return {
    ...parsed,
    updatedAt: new Date(parsed.updatedAt).toISOString(),
  };
}

// The columns a direct RLS-scoped read selects, and the snake_case -> view
// mapping, shared by the single-row read and the active-list read.
const SETUP_COLUMNS =
  "id, device_id, provider, status, stage, progress_message, error_code, error_message, updated_at";

function mapSetupRow(row: {
  id: unknown;
  device_id: unknown;
  provider: unknown;
  status: unknown;
  stage: unknown;
  progress_message: unknown;
  error_code: unknown;
  error_message: unknown;
  updated_at: unknown;
}): ProviderSetupView {
  return parseProviderSetupView({
    id: row.id,
    deviceId: row.device_id,
    provider: row.provider,
    status: row.status,
    stage: row.stage,
    progressMessage: row.progress_message,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    updatedAt: row.updated_at,
  });
}

export async function createProviderSetup(
  supabase: SupabaseClient,
  input: CreateProviderSetupInput,
): Promise<ProviderSetupView> {
  try {
    // The RPC is idempotent: it locks the device, and a repeated press returns
    // the existing live request rather than queueing a duplicate install.
    const { data, error } = await supabase.rpc(
      "create_provider_setup_request",
      {
        target_device_id: input.deviceId,
        target_provider: input.provider,
      },
    );

    if (error || !data) {
      throw new ProviderSetupServiceError(errorCode(error));
    }

    return parseProviderSetupView(data);
  } catch (error) {
    throw serviceError(error);
  }
}

export async function getProviderSetup(
  supabase: SupabaseClient,
  requestId: string,
): Promise<ProviderSetupView> {
  try {
    // Row-level security scopes this SELECT to the caller's own requests, so
    // another user's id resolves to no row and surfaces as not_found.
    const { data, error } = await supabase
      .from("provider_setup_requests")
      .select(SETUP_COLUMNS)
      .eq("id", requestId)
      .maybeSingle();

    if (error) {
      throw new ProviderSetupServiceError("provider_setup_failed");
    }

    if (!data) {
      throw new ProviderSetupServiceError("not_found");
    }

    return mapSetupRow(data);
  } catch (error) {
    throw serviceError(error);
  }
}

// Discovery read for the first-pair flow: pairing creates the setup row
// server-side (redeem_device_pairing_code) but the browser never learns the
// request id, so the page finds the newest setup created for this pairing
// attempt. RLS scopes this to the caller's rows. Terminal rows are included so
// a fast failure or completion cannot disappear before the first browser poll.
export async function listProviderSetupsForPairing(
  supabase: SupabaseClient,
  provider: Provider,
  createdAfter: string,
): Promise<ProviderSetupView[]> {
  try {
    const { data, error } = await supabase
      .from("provider_setup_requests")
      .select(SETUP_COLUMNS)
      .eq("provider", provider)
      .gte("created_at", createdAfter)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      throw new ProviderSetupServiceError("provider_setup_failed");
    }

    return (data ?? []).map(mapSetupRow);
  } catch (error) {
    throw serviceError(error);
  }
}
