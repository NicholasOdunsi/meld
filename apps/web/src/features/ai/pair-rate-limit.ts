import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PER_KEY_ATTEMPT_LIMIT = 10;
const FALLBACK_CLIENT_ADDRESS = "unknown-client";

function validAddress(value: string | null): string | null {
  const candidate = value?.trim() ?? "";
  return isIP(candidate) === 0 ? null : candidate;
}

export function pairingClientAddress(request: Request): string {
  const realIp = validAddress(request.headers.get("x-real-ip"));
  if (realIp) return realIp;

  const forwardedAddresses = (
    request.headers.get("x-forwarded-for") ?? ""
  )
    .split(",")
    .map((address) => validAddress(address))
    .filter((address): address is string => address !== null);

  return forwardedAddresses.at(-1) ?? FALLBACK_CLIENT_ADDRESS;
}

export function pairRateLimitKey(request: Request): string {
  return createHash("sha256")
    .update(pairingClientAddress(request))
    .digest("hex");
}

export async function consumePairAttempt(
  supabase: Pick<SupabaseClient, "rpc">,
  clientKey: string,
): Promise<{ allowed: boolean }> {
  const result = await supabase.rpc("consume_device_pair_attempt", {
    target_client_key: clientKey,
  });

  if (result.error || typeof result.data !== "boolean") {
    throw new Error("Device pairing rate limiter is unavailable.");
  }

  return { allowed: result.data };
}
