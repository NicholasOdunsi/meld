import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createDiscoveryRepository } from "./repository";

export async function getAuthenticatedRepository() {
  const supabase = await createClient(new Headers());
  // getClaims() verifies the JWT signature locally against the cached JWKS
  // (this project signs with asymmetric keys), where getUser() posts to the
  // Auth server on every single call. With getUser(), a request touching
  // several of these helpers issued several sequential round trips, and each
  // fresh client independently tried to refresh a near-expiry session --
  // which GoTrue rejects with "409 Too many concurrent token refresh
  // requests on the same session", after stalling for 10-15s. getClaims() is
  // still a real cryptographic verification, so this is not a downgrade in
  // trust; the Supabase docs recommend it over getUser() for exactly this.
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    throw new Error("Authentication required");
  }
  return {
    supabase,
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : undefined,
      // Supabase access tokens carry user_metadata as a claim, so the
      // display name is still available without a call to the Auth server.
      user_metadata: (claims.user_metadata ?? {}) as Record<
        string,
        unknown
      >,
    },
    repository: createDiscoveryRepository(supabase),
  };
}
