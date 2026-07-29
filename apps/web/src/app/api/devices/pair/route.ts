import {
  RedeemPairingCodeInputSchema,
  redeemPairingCode,
} from "@/features/ai/device-service";
import {
  consumePairAttempt,
  recordPairFailure,
} from "@/features/ai/pair-rate-limit";
import { createClient } from "@/lib/supabase/server";

const INVALID_PAIRING_CODE = "Invalid or expired pairing code.";
const RATE_LIMITED = "Too many pairing attempts.";
const FALLBACK_RATE_LIMIT_KEY = "unknown-client";

function rateLimitKey(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    FALLBACK_RATE_LIMIT_KEY
  );
}

export async function POST(request: Request) {
  const responseHeaders = new Headers();
  const key = rateLimitKey(request);

  if (!consumePairAttempt(key).allowed) {
    return Response.json(
      { error: RATE_LIMITED },
      { status: 429, headers: responseHeaders },
    );
  }

  const supabase = await createClient(responseHeaders);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    recordPairFailure(key);
    return Response.json(
      { error: INVALID_PAIRING_CODE },
      { status: 400, headers: responseHeaders },
    );
  }

  const parsed = RedeemPairingCodeInputSchema.safeParse(body);
  if (!parsed.success) {
    recordPairFailure(key);
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
    recordPairFailure(key);
    return Response.json(
      { error: INVALID_PAIRING_CODE },
      { status: 400, headers: responseHeaders },
    );
  }
}
