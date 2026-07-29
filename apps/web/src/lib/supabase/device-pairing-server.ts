import "server-only";

import { createClient } from "@supabase/supabase-js";

type DevicePairingEnvironment = Record<
  string,
  string | undefined
>;

function required(
  environment: DevicePairingEnvironment,
  name:
    | "NEXT_PUBLIC_SUPABASE_URL"
    | "MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY",
): string {
  const value = environment[name];
  if (!value) {
    throw new Error(`Invalid device pairing configuration: ${name}`);
  }
  return value;
}

export function createDevicePairingServerClient(
  environment: DevicePairingEnvironment = process.env,
) {
  return createClient(
    required(environment, "NEXT_PUBLIC_SUPABASE_URL"),
    required(environment, "MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
