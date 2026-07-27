import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient(responseHeaders: Headers) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet, headers) {
          Object.entries(headers).forEach(([name, value]) => {
            responseHeaders.set(name, value);
          });

          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot write cookies. The request proxy
            // refreshes sessions before those components render.
          }
        },
      },
    },
  );
}
