import { createClient } from "@supabase/supabase-js";

export interface Env {
  DEVICE_HUB: DurableObjectNamespace;
  CANVAS_ROOM: DurableObjectNamespace;
  GATEWAY_SUPABASE_URL: string;
  GATEWAY_SUPABASE_SERVICE_ROLE_KEY: string;
  MELD_CANVAS_SESSION_SECRET: string;
  GATEWAY_HEARTBEAT_SECONDS: string;
  GATEWAY_POLL_INTERVAL_MS: string;
}

export function createSupabase(env: Env) {
  return createClient(env.GATEWAY_SUPABASE_URL, env.GATEWAY_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function positiveInt(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid gateway configuration: ${name}`);
  }
  return parsed;
}
