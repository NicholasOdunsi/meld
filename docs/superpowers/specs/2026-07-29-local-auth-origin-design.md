# Local Auth Origin Design

## Goal

Make locally generated Supabase magic links return to the running Meld app at
`http://127.0.0.1:3000` instead of `localhost`.

## Design

The local authentication origin has two independent inputs and both must agree:

- Supabase Auth uses `auth.site_url` as its fallback redirect origin.
- Meld uses `NEXT_PUBLIC_APP_URL` to construct the explicit
  `/auth/callback` URL passed to `signInWithOtp`.

Set both values to `http://127.0.0.1:3000`. Keep the existing localhost and
127.0.0.1 callback URLs in `additional_redirect_urls` so previously generated
links and alternate local access remain accepted.

Update `.env.example` to advertise the same canonical local origin. Do not
change production redirect validation or broaden the allowed URL protocols.

## Runtime Procedure

1. Change `supabase/config.toml`:
   `site_url = "http://127.0.0.1:3000"`.
2. Change `.env.example`:
   `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000`.
3. Restart the local Supabase stack so Auth reloads `site_url`.
4. Restart the web app with
   `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000`.
5. Request a new magic link; previously issued email links remain unchanged.

## Verification

- Supabase reports healthy after restart.
- Web redirects unauthenticated requests to `/sign-in`.
- A newly requested Mailpit message contains a callback whose
  `redirect_to` targets `http://127.0.0.1:3000/auth/callback`.
- Opening the new link reaches the app on port `3000`, not `localhost`.

## Scope

This changes local development configuration only. It does not alter hosted
environment URLs, OAuth provider configuration, or authentication logic.
