# Local Auth Origin Alignment Design

## Problem

Local Meld is opened at `http://127.0.0.1:3000`, while
`apps/web/.env.local` currently sets `NEXT_PUBLIC_APP_URL` to
`http://localhost:3000`. Supabase's PKCE verifier is stored in a host-only
browser cookie. The magic link therefore returns to a different host from the
one that initiated sign-in, and Supabase rejects the callback with
`bad_code_verifier`.

## Design

Set the gitignored local `NEXT_PUBLIC_APP_URL` value to
`http://127.0.0.1:3000`, matching the address used to access Meld. Keep the
Supabase API URL and all tracked application code unchanged.

Restart the Next.js development server so it loads the updated environment.
Existing magic links remain invalid because they were created for the old
origin; verification must request and open one new link after the restart.

## Scope

- Update only `apps/web/.env.local`.
- Restart only the Next.js process listening on port 3000.
- Do not change Supabase's PKCE flow, callback route, email template, or
  production configuration.
- Do not commit the gitignored environment file or expose local credentials.

## Verification

1. Confirm Next reports that it loaded `.env.local`.
2. Confirm `http://127.0.0.1:3000/sign-in` responds successfully.
3. Request a new magic link from that origin.
4. Confirm the email redirects to
   `http://127.0.0.1:3000/auth/callback`.
5. Confirm the callback establishes a session and no longer redirects to
   `/sign-in?error=callback`.
