import "server-only";

import { createClient } from "@supabase/supabase-js";

type ShelfEnvironment = Record<string, string | undefined>;

function required(environment: ShelfEnvironment, name: "NEXT_PUBLIC_SUPABASE_URL" | "MELD_SHELF_SERVICE_ROLE_KEY"): string {
  const value = environment[name];
  if (!value) throw new Error(`Invalid shelf configuration: ${name}`);
  return value;
}

// Service-role client for the shelf routes only. Every call it makes goes to a
// capture_/resolve_/redeem_/list_capture_ RPC that re-checks the actor.
export function createShelfServerClient(environment: ShelfEnvironment = process.env) {
  return createClient(
    required(environment, "NEXT_PUBLIC_SUPABASE_URL"),
    required(environment, "MELD_SHELF_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
