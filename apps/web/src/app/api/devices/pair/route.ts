import {
  RedeemPairingCodeInputSchema,
  redeemPairingCode,
} from "@/features/ai/device-service";
import {
  consumePairAttempt,
  pairRateLimitKey,
} from "@/features/ai/pair-rate-limit";
import { createDevicePairingServerClient } from "@/lib/supabase/device-pairing-server";

const INVALID_PAIRING_CODE = "Invalid or expired pairing code.";
const RATE_LIMITED = "Too many pairing attempts.";
const PAIRING_UNAVAILABLE =
  "Device pairing is temporarily unavailable.";
const CONFIGURATION_ERROR_PREFIX =
  "Invalid device pairing configuration: ";

function logDevicePairingConfigurationError(error: unknown) {
  let missingVariable: string | undefined;

  if (error instanceof Error) {
    if (
      error.message ===
      `${CONFIGURATION_ERROR_PREFIX}NEXT_PUBLIC_SUPABASE_URL`
    ) {
      missingVariable = "NEXT_PUBLIC_SUPABASE_URL";
    } else if (
      error.message ===
      `${CONFIGURATION_ERROR_PREFIX}MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY`
    ) {
      missingVariable =
        "MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY";
    }
  }

  console.error(
    missingVariable
      ? `Device pairing server configuration error: missing ${missingVariable}`
      : "Device pairing server configuration error",
  );
}

export async function POST(request: Request) {
  const responseHeaders = new Headers();
  const key = pairRateLimitKey(request);

  let supabase: ReturnType<
    typeof createDevicePairingServerClient
  >;
  try {
    supabase = createDevicePairingServerClient();
  } catch (error) {
    logDevicePairingConfigurationError(error);
    return Response.json(
      { error: PAIRING_UNAVAILABLE },
      { status: 500, headers: responseHeaders },
    );
  }

  try {
    if (!(await consumePairAttempt(supabase, key)).allowed) {
      return Response.json(
        { error: RATE_LIMITED },
        { status: 429, headers: responseHeaders },
      );
    }
  } catch {
    console.error("Device pairing rate limiter error");
    return Response.json(
      { error: PAIRING_UNAVAILABLE },
      { status: 503, headers: responseHeaders },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: INVALID_PAIRING_CODE },
      { status: 400, headers: responseHeaders },
    );
  }

  const parsed = RedeemPairingCodeInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: INVALID_PAIRING_CODE },
      { status: 400, headers: responseHeaders },
    );
  }

  try {
    const credential = await redeemPairingCode(
      supabase,
      parsed.data,
    );
    return Response.json(credential, {
      status: 201,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: INVALID_PAIRING_CODE },
      { status: 400, headers: responseHeaders },
    );
  }
}
