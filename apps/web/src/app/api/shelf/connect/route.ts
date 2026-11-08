import { ShelfConnectRequestSchema, type ShelfConnectResponse } from "@meld/contracts";
import { hashToken, mintCaptureToken, normalizePairingCode } from "@meld/device-auth";
import { z } from "zod";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { consumeShelfConnectAttempt, recordShelfConnectFailure } from "@/features/inspiration/shelf-rate-limit";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

const RedeemedSchema = z.object({ workspace_id: z.string().uuid(), workspace_name: z.string() });
const FALLBACK_RATE_LIMIT_KEY = "unknown-client";

function rateLimitKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || FALLBACK_RATE_LIMIT_KEY;
}

export async function POST(request: Request) {
  const key = rateLimitKey(request);
  if (!consumeShelfConnectAttempt(key).allowed) return shelfError("rate_limited");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    recordShelfConnectFailure(key);
    return shelfError("invalid_code");
  }
  const parsed = ShelfConnectRequestSchema.safeParse(body);
  if (!parsed.success) {
    recordShelfConnectFailure(key);
    return shelfError("invalid_code");
  }

  let supabase: ReturnType<typeof createShelfServerClient>;
  try {
    supabase = createShelfServerClient();
  } catch {
    console.error("Shelf server configuration error");
    return shelfError("unavailable");
  }

  const minted = mintCaptureToken();
  const { data, error } = await supabase.rpc("redeem_capture_connect_code", {
    connect_code_hash: hashToken(normalizePairingCode(parsed.data.code)),
    new_token_hash: minted.tokenHash,
    new_device_name: parsed.data.deviceName,
  });
  const redeemed = RedeemedSchema.safeParse(data);
  if (error || !redeemed.success) {
    // Never say why: expired, used, and unknown codes look the same.
    recordShelfConnectFailure(key);
    return shelfError("invalid_code");
  }

  const response: ShelfConnectResponse = {
    token: minted.token,
    workspaceId: redeemed.data.workspace_id,
    workspaceName: redeemed.data.workspace_name,
  };
  return Response.json(response, { status: 201 });
}
