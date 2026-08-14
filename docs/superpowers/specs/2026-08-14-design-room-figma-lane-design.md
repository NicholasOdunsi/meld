# Design Room slice 4a — Figma lane (link previews)

## Context

This is the first half of slice 4 of the Design Room (`docs/superpowers/specs/2026-08-13-design-room-design.md`, the **Figma lane** §359–391). Slice 4 was split during brainstorming into:

- **4a — Figma lane** (this spec): paste a Figma URL in the conversation → an optimistic preview card backed by a cached oEmbed thumbnail, with ingestion hardening.
- **4b — readiness + handoff** (separate spec): rewire "Screens designed" to count built screens **or** Figma references, add staleness invalidation, write/render the immutable Development handoff snapshot. 4b depends on 4a existing.

**The database layer already exists** (slice-1 migration `202608130009_design_references_handoffs.sql`):
- `design_references` — `id, room_id, normalized_url, title, thumbnail_ref, oembed_status ('pending'|'ok'|'failed'), fetched_at, created_by, created_at`; `unique (room_id, normalized_url)`; participant-SELECT RLS.
- RPC `add_design_reference(target_room_id, url, ref_title, thumb, status)` — editor-gated, **upserts** on `(room_id, normalized_url)` (updates title/thumbnail_ref/oembed_status/fetched_at on conflict).
- RPC `delete_design_reference(target_reference_id)` — editor-gated.

So 4a is almost entirely **app-layer**: detection, the oEmbed fetch + thumbnail cache, and the card UI. No new migration is required unless a Storage bucket needs provisioning (see Thumbnail storage).

**Proven groundwork:** `scripts/design/figma-oembed-check.mjs` (+ `.test.mjs`) — the slice-0 spike that proved the oEmbed endpoint, URL-shape enforcement, and self-test (9/9). Its normalization + fetch logic is the basis for the shared module below.

## Goal

Pasting a Figma design URL into a room's conversation produces a preview card — a cached thumbnail, sanitized title, and an "Open in Figma" link — that appears immediately as a link card and upgrades in place when the thumbnail arrives, degrading to a plain link card if Figma is slow, down, or returns nothing. A valid Figma link counts toward Design-stage readiness (wired in 4b) even when oEmbed fails.

## Decisions (from brainstorming)

1. **Auto-unfurl, optimistic.** Detection is automatic on message post; the card renders immediately (pending → link card) and the thumbnail fills in via a background fetch. Posting never blocks on Figma.
2. **Detection runs in the Next.js `postMessage` server action, not the DB RPC.** Postgres does not do HTTP/URL policy; the server action scans the persisted message body after insert.
3. **One lazy on-view fetch mechanism serves both the initial fetch and the 7-day TTL refresh** — no job queue, no post-path latency.
4. **Thumbnails are cached in Meld Storage and served via signed URLs — never hotlinked.**
5. **No dedicated "references panel," no manual refresh button, no canvas Figma cards, no OAuth, no frames-as-images** in v1.

## Architecture and data flow

### Detection (on post)

In the existing `postMessage` server action (`apps/web/src/features/rooms/actions.ts` → `getRoomBackend().postMessage`), after the message row persists, run a pure `extractFigmaReferences(body)`:

- Scan the body for URLs.
- Keep only hosts in the allowlist (`figma.com`, `www.figma.com`); everything else is an ordinary link and produces **no** reference.
- **Normalize** each: lowercase host, strip all query parameters **except `node-id`**, drop the fragment. This is the uniqueness key.
- De-duplicate within the message.

For each normalized URL, call `add_design_reference(roomId, normalizedUrl, ref_title := null, thumb := null, status := 'pending')`. The RPC's existing `on conflict (room_id, normalized_url)` makes re-pasting idempotent. Detection failures are swallowed — a bad URL never blocks the message send.

### Optimistic render

The conversation surfaces a preview card for each reference. Newly-created references are `pending`, so the card renders as a **plain link card** (host + the URL as its label) with a subtle loading hint.

References are read alongside the room's messages (a `listRoomDesignReferences(roomId)` reader, RLS-gated, mirroring `listRoomDesignEvents`). The card associates to the message by matching the message's normalized Figma URLs to reference rows — references are room-scoped, not message-FK'd, which is sufficient because the normalized URL is unique per room.

### Lazy fetch / refresh (the single mechanism)

A client effect on any card whose reference is **`pending`**, or **`ok` with `fetched_at` older than 7 days**, calls the server action `refreshDesignReference(referenceId)`. **The effect only fires for editors** (edit access) — a viewer's card renders whatever state an editor's fetch has already produced (a plain link card until then), so viewers never trigger a doomed write. The action is idempotent and safe under concurrent editors (last-writer-wins on identical data via the upsert), and it also **re-checks edit access first and no-ops for non-editors** as a server-side backstop.

`refreshDesignReference`:

1. Loads the reference (must be a room the caller can edit — reuse the RPC's `can_edit_room` boundary; a viewer never triggers a write).
2. Fetches the Figma **public oEmbed** endpoint for the normalized URL: 5 s timeout, response capped at ≤64 KiB, **no redirects to non-allowlisted hosts**.
3. Parses `title` and the thumbnail URL from the oEmbed JSON; treats both as **untrusted text**.
4. Downloads the thumbnail image (same 5 s / 64 KiB / no-off-allowlist-redirect limits) and stores the bytes in a room/workspace-scoped Storage bucket, under the same RLS pattern as existing attachments. The bucket path is written to `thumbnail_ref`.
5. Calls `add_design_reference(...)` (the upsert) with `status := 'ok'`, the sanitized title, and the `thumbnail_ref`; **or** `status := 'failed'` on any timeout, oversize, redirect-off-allowlist, non-2xx, or parse failure.

Returns the updated reference view so the card upgrades in place.

### Serving

The card renders the thumbnail via a **signed URL** minted for the bucket object — proxied and cached by Meld, never hotlinked (avoids leaking each viewer's IP to Figma and surviving Figma's URL expiry). A `failed` or still-`pending` reference renders the plain link card.

## The shared ingestion module

Extract the proven logic from `scripts/design/figma-oembed-check.mjs` into a pure, unit-tested module (web util or `@meld/prototype`, depending only on standard URL parsing + Zod):

- `isFigmaHost(host)` — allowlist check.
- `normalizeFigmaUrl(raw)` — lowercase host, strip query except `node-id`, drop fragment; returns the normalized URL or `null` if not an allowlisted Figma URL.
- `parseFigmaOEmbed(json)` — validate + extract `{ title, thumbnailUrl }`, sanitizing (untrusted text, no HTML).
- The fetch caller enforces the 5 s / 64 KiB / no-off-allowlist-redirect limits.

The HTTP fetch + Storage write live in `refreshDesignReference` (server-only), not the pure module.

## The preview card

An in-conversation card built from `@astryxdesign/core` primitives (no raw HTML, no bare px — follow `room-inspector.tsx`, not `stage-coaching-panel.tsx`):

- **`ok`:** cached thumbnail (signed URL), sanitized title, host label, "Open in Figma" link opening the **original** URL in a new tab (`rel="noopener noreferrer"`).
- **`pending`:** link card (host + URL) with a subtle loading hint; the lazy effect is fetching.
- **`failed`:** plain link card (still opens in Figma; still counts for readiness in 4b).
- **Editor-only remove affordance** → `delete_design_reference(referenceId)`.

## Security boundary

- The oEmbed and thumbnail fetches are the only outbound calls; both enforce timeout, size cap, and no off-allowlist redirects.
- `title` and any oEmbed text are untrusted and escaped on render; the card never renders remote HTML.
- Thumbnails are served from Meld Storage via signed URLs; remote Figma image URLs are never placed in `src`.
- All writes go through the editor-gated RPCs; viewers only read (RLS).

## Testing

- **Pure engine, exhaustively:** `normalizeFigmaUrl` (host allowlist, `node-id` retention, query/fragment stripping, non-Figma → null), `parseFigmaOEmbed` (valid, missing fields, sanitization), and the fetch limits (rejection tests for oversized response, redirect off allowlist, timeout, non-2xx).
- **Detection:** `extractFigmaReferences` over message bodies (multiple links, dupes, non-Figma ignored).
- **`refreshDesignReference` server action:** mocked fetch + Storage — `ok`, `failed` (each rejection path), idempotent re-run, viewer cannot trigger a write.
- **e2e:** paste a Figma link → a link card appears → (fake) refresh → thumbnail card → remove. Runs on the fake path (`isRoomFakeEnabled`), mirroring the existing design e2e specs.
- **Human gate before shipping the card UI:** `node scripts/design/figma-oembed-check.mjs --live "<a real link-shared /design/ or /file/ URL>"` — the slice-0 OPEN item; the spike could only verify against a non-community URL, which the endpoint rejects.

## Scope

**In v1 (4a):** Figma URL detection on post; optimistic link → thumbnail card; hardened oEmbed fetch + cached thumbnail; lazy on-view fetch with 7-day TTL refresh; editor remove.

**Deliberately not in 4a:** the readiness rewiring and the Development handoff (both 4b); Figma cards on the canvas; a manual refresh button; a dedicated references panel; OAuth; frames-as-images; variables-as-tokens.

## Plan note

4a is a single implementation plan (one working vertical). The likely task shape: the shared pure module → `extractFigmaReferences` + `postMessage` detection wiring → `listRoomDesignReferences` reader → `refreshDesignReference` server action (fetch + Storage) → the preview card + conversation wiring → e2e. 4b gets its own spec and plan afterward.
