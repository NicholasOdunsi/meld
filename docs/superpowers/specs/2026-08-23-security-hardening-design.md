# Security hardening design

## Scope

This change closes three audit findings without changing the product workflow:

1. Device-pairing throttling must work across web instances and restarts.
2. Attachments capable of executing active content must never receive inline signed URLs.
3. Production dependency advisories must be removed without broad major-version upgrades.

## Device-pairing throttling

The current process-local failure maps are replaced by a private PostgreSQL table and a service-role-only `consume_device_pair_attempt` RPC. The RPC atomically starts or advances a ten-minute counter for a SHA-256 client key and returns whether the request is within the ten-attempt allowance. Counting every attempt produces one database round trip, removes the check/record race, and remains correct across replicas.

The route derives the client address from the closest proxy's canonical headers: a valid `x-real-ip` first, then the rightmost valid `x-forwarded-for` address. It hashes that address before sending it to PostgreSQL. Missing or invalid forwarding metadata shares a conservative fallback bucket. Deployment must continue to strip or overwrite these forwarding headers at the public edge.

Expired limiter rows are opportunistically removed by the RPC. The table and function are inaccessible to browser roles; only the server's existing device-pairing service-role client may execute the function.

## Attachment delivery

`text/html`, `application/xml`, `text/xml`, and `image/svg+xml` are active document formats. Both attachment-list signing and individual attachment signing pass Supabase Storage's download option for these MIME types. Other supported formats keep their existing inline behavior.

## Dependencies

Upgrade the affected Next.js and Fastify minors, then pin only any still-vulnerable transitives to their patched compatible releases. The acceptance condition is a clean production `pnpm audit`, followed by the repository's typecheck, lint, tests, and build.
