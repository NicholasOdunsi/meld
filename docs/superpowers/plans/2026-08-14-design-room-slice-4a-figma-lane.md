# Design Room Slice 4a — Figma Lane (Link Previews) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasting a Figma design URL into a room's conversation produces a preview card — cached thumbnail, sanitized title, "Open in Figma" link — that appears immediately as a link card and upgrades in place when the thumbnail arrives, degrading to a plain link card if Figma is slow/down.

**Architecture:** Detection runs in the `postMessage` server action after the message persists (best-effort, like the reply task): a pure `extractFigmaReferences(body)` normalizes allowlisted Figma URLs and upserts `design_references` rows (`pending`) via the existing `add_design_reference` RPC. The conversation renders a card per matched reference. A single lazy on-view `refreshDesignReference` server action — editor-only — does the hardened oEmbed fetch, caches the thumbnail in a private Storage bucket, and upserts the row to `ok`/`failed`; it serves both the initial fetch and the 7-day TTL refresh. Thumbnails render via signed URLs (never hotlinked).

**Tech Stack:** Next.js App Router, `@supabase/ssr` + Supabase Storage, `@astryxdesign/core`, TypeScript 5.9.3, Zod 4.4.3, vitest, Playwright, Node 22.23.2.

**Design spec:** `docs/superpowers/specs/2026-08-14-design-room-figma-lane-design.md`
**Master spec:** `docs/superpowers/specs/2026-08-13-design-room-design.md` (Figma lane §359–391)
**Builds on (already migrated, slice-1 `202608130009_design_references_handoffs.sql`):**
- `design_references` (`id, room_id, normalized_url, title, thumbnail_ref, oembed_status 'pending'|'ok'|'failed', fetched_at, created_by, created_at`; `unique (room_id, normalized_url)`; participant-SELECT RLS).
- RPC `add_design_reference(target_room_id, url, ref_title, thumb, status)` — editor-gated, upserts on `(room_id, normalized_url)`, sets `fetched_at = now()` only when `status='ok'`.
- RPC `delete_design_reference(target_reference_id)` — editor-gated.
**Lifts from:** `scripts/design/figma-oembed-check.mjs` (`normalizeFigmaUrl`, `fetchOembed`, `readCapped`, `ALLOWED_HOSTS`, `MAX_RESPONSE_BYTES`, `DEFAULT_TIMEOUT_MS`) — proven in the slice-0 spike (9/9).

## Global Constraints

- Node `>=22.23.2`, pnpm `10.28.1`, TS `5.9.3`, Zod `4.4.3`. Never change versions.
- **The DB tables + `add_design_reference`/`delete_design_reference` RPCs already exist — do NOT recreate them.** 4a adds only the thumbnail Storage bucket (Task 1) and the TS layer.
- **Host allowlist:** `figma.com`, `www.figma.com` only; `https:` only. Anything else is an ordinary link — no reference, no card.
- **Normalize** exactly as the spike: lowercase host, strip credentials + fragment, drop every query param **except `node-id`**. This is the `design_references.normalized_url` uniqueness key.
- **Fetch hardening:** Figma public oEmbed (`https://www.figma.com/api/oembed?url=<encoded>`), 5 s `AbortController` timeout, `redirect: "error"`, response streamed and capped at ≤64 KiB (`readCapped`). Same limits for the thumbnail image download.
- **Untrusted text:** `title` and any oEmbed field are escaped on render; the card never renders remote HTML and never puts a remote Figma URL in an `<img src>`.
- **Thumbnails are cached in Meld Storage and served via signed URLs** (private bucket, 60-min TTL), never hotlinked.
- **Optimistic + best-effort:** detection never blocks or rolls back a message post; a valid Figma link still creates a reference (so it counts toward 4b readiness) even when oEmbed fails.
- **Editor-only writes.** `refreshDesignReference`/`recordFigmaReferences`/`removeDesignReference` all pass through the editor-gated RPCs (`can_edit_room`); viewers only read (RLS). The lazy-refresh effect fires only for editors.
- `apps/web/src` obeys `check:astryx` (root script `pnpm check:astryx`, NOT `--filter web`) — `@astryxdesign/core` primitives, no raw `<div>`/`<span>`, no hex/rgb, no bare px. Follow `message-attachments.tsx`/`room-inspector.tsx`, NOT `stage-coaching-panel.tsx` (pre-existing violations there are unrelated).
- Every reader/action mirrors the established shape: Zod input guard, `isRoomFakeEnabled()` dynamic-import branch to `@/features/rooms/e2e-fake`, `createClient(new Headers())`, `.passthrough()` row schema, safe fallback.
- Any UUID literal in a test fixture must be RFC4122-valid (Zod 4.4.3 `.uuid()` rejects `1111…-1111-1111-…`; use `…-4xxx-8xxx-…`).
- **Migration numbering:** next free is `202608140005_*` (0001–0004 are taken; the untracked `user_flow_assist` files sit at 0001/0002 — leave them).

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/202608140005_design_reference_thumbnails.sql` | Private `design-reference-thumbnails` Storage bucket + 4 RLS policies (mirror `discovery-attachments`). |
| `apps/web/src/features/design/figma-url.ts` | Pure: `normalizeFigmaUrl`, `extractFigmaReferences(body)`, `parseFigmaOEmbed(json)`, `FIGMA_ALLOWED_HOSTS`. |
| `apps/web/src/features/design/figma-url.test.ts` | Exhaustive pure tests. |
| `apps/web/src/features/design/figma-oembed.ts` | `import "server-only"`: `fetchFigmaOEmbed(normalizedUrl)` (capped, timed, no-redirect) — lifted from the spike. |
| `apps/web/src/features/design/figma-oembed.test.ts` | Mocked-fetch tests (ok/too-large/timeout/redirect/non-2xx). |
| `packages/contracts/src/design-references.ts` | `DesignReferenceSchema` + `DesignReferenceView` type + `OEmbedStatus`. |
| `packages/contracts/src/design-references.test.ts` | Schema tests. |
| `packages/contracts/src/index.ts` | Re-export `./design-references`. |
| `apps/web/src/features/design/design-references-reader.ts` | `"use server"` `listRoomDesignReferences(roomId)` → `DesignReferenceView[]` (signs thumbnails); fake branch. |
| `apps/web/src/features/design/design-references-reader.test.ts` | Reader tests. |
| `apps/web/src/features/design/design-references-actions.ts` | `"use server"` `recordFigmaReferences(roomId, body)`, `refreshDesignReference(referenceId)`, `removeDesignReference(referenceId)`; fake branches. |
| `apps/web/src/features/design/design-references-actions.test.ts` | Action tests. |
| `apps/web/src/features/rooms/actions.ts` | Wire `recordFigmaReferences` into `postMessage` after persist (best-effort). |
| `apps/web/src/features/rooms/e2e-fake.ts` | Fake store + `fakeListRoomDesignReferences`, `fakeRecordFigmaReferences`, `fakeRefreshDesignReference`, `fakeRemoveDesignReference`. |
| `apps/web/src/features/design/components/figma-reference-card.tsx` | The preview card (pending/ok/failed) + editor lazy-refresh effect + remove. |
| `apps/web/src/features/design/components/figma-reference-card.test.tsx` | Card render + state + refresh-trigger tests. |
| `apps/web/src/features/rooms/components/conversation.tsx` | Render `FigmaReferenceCard`s per message (match by normalized URL). |
| `e2e/design-figma-lane.spec.ts` | Paste link → link card → (fake) refresh → thumbnail card → remove. |

---

### Task 1: Thumbnail Storage bucket + RLS

**Files:** Create `supabase/migrations/202608140005_design_reference_thumbnails.sql`; Test: `supabase/tests/design_reference_thumbnails.test.sql`.

**Interfaces:**
- Produces (SQL): a private Storage bucket `design-reference-thumbnails` with participant-scoped RLS on `storage.objects`, path convention `<roomId>/<referenceId>` (so `public.storage_room_id(name)` resolves the room, exactly as `discovery-attachments` does).

- [ ] **Step 1: Write the failing pgTAP test**

Create `supabase/tests/design_reference_thumbnails.test.sql` mirroring an existing storage/bucket assertion style (grep for how any current test checks `storage.buckets`; if none, assert bucket existence + privacy):

```sql
begin;
select plan(2);
select is(
  (select public from storage.buckets where id = 'design-reference-thumbnails'),
  false, 'thumbnail bucket exists and is private'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and qual like '%design-reference-thumbnails%'),
  'thumbnail bucket has a participant RLS policy'
);
select * from finish();
rollback;
```

- [ ] **Step 2: Run → fail** — `~/.local/share/supabase/supabase test db` (pinned CLI 2.109.1). Expected: FAIL (bucket/policies absent).

- [ ] **Step 3: Write the migration**

Read `supabase/migrations/202607240004_discovery.sql:541–602` (the `discovery-attachments` bucket insert + its four `storage.objects` policies) and mirror it, substituting the bucket id and image mime types:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'design-reference-thumbnails', 'design-reference-thumbnails', false,
  5 * 1024 * 1024,
  array['image/png','image/jpeg','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Participant-scoped, keyed on the room id encoded as the first path segment,
-- exactly like discovery-attachments. storage_room_id(name) already exists.
create policy "Participants read design reference thumbnails"
on storage.objects for select to authenticated
using (
  bucket_id = 'design-reference-thumbnails'
  and public.is_room_participant(public.storage_room_id(name))
);
create policy "Editors write design reference thumbnails"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'design-reference-thumbnails'
  and public.can_edit_room(public.storage_room_id(name))
);
create policy "Editors update design reference thumbnails"
on storage.objects for update to authenticated
using (
  bucket_id = 'design-reference-thumbnails'
  and public.can_edit_room(public.storage_room_id(name))
);
create policy "Editors delete design reference thumbnails"
on storage.objects for delete to authenticated
using (
  bucket_id = 'design-reference-thumbnails'
  and public.can_edit_room(public.storage_room_id(name))
);
```

> Confirm `public.storage_room_id(name)` and `public.can_edit_room(uuid)` exist (both used by the discovery-attachments policies / the `add_design_reference` RPC). If the discovery policies use a different helper name, match theirs exactly.

- [ ] **Step 4: Run → pass** — `~/.local/share/supabase/supabase test db`. Expected: PASS (full suite green, incl. the 2 new assertions).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/202608140005_design_reference_thumbnails.sql supabase/tests/design_reference_thumbnails.test.sql
git commit -m "feat(design): private storage bucket for cached Figma reference thumbnails"
```

---

### Task 2: Shared Figma ingestion module (pure URL + hardened fetch)

**Files:** Create `apps/web/src/features/design/figma-url.ts` (+ test) and `apps/web/src/features/design/figma-oembed.ts` (+ test).

**Interfaces:**
- Produces (pure, `figma-url.ts`):
  - `const FIGMA_ALLOWED_HOSTS: ReadonlySet<string>` = `{"figma.com","www.figma.com"}`.
  - `normalizeFigmaUrl(input: string): string | null` — the spike's logic.
  - `extractFigmaReferences(body: string): string[]` — scan the body for URL-like tokens, `normalizeFigmaUrl` each, drop nulls, de-dupe preserving order.
  - `parseFigmaOEmbed(json: unknown): { title: string | null; thumbnailUrl: string | null }` — validated, sanitized (untrusted text; no HTML).
- Produces (`figma-oembed.ts`, `import "server-only"`):
  - `type FigmaOEmbedResult = { ok: boolean; thumbnailUrl: string | null; title: string | null; status: number | "too-large" | "timeout" | "error" }`.
  - `fetchFigmaOEmbed(normalizedUrl: string, opts?: { timeoutMs?: number; origin?: string; fetchImpl?: typeof fetch }): Promise<FigmaOEmbedResult>` — lifted `fetchOembed` + `readCapped`, `fetchImpl` injectable for tests.

- [ ] **Step 1: Write the failing pure test** (`figma-url.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { normalizeFigmaUrl, extractFigmaReferences, parseFigmaOEmbed } from "./figma-url";

describe("normalizeFigmaUrl", () => {
  it("keeps only node-id, lowercases host, drops fragment", () => {
    expect(normalizeFigmaUrl("https://WWW.figma.com/design/abc/Name?node-id=1-2&x=9#frag"))
      .toBe("https://www.figma.com/design/abc/Name?node-id=1-2");
  });
  it("rejects non-figma hosts", () => {
    expect(normalizeFigmaUrl("https://evil.com/design/abc")).toBeNull();
  });
  it("rejects non-https", () => {
    expect(normalizeFigmaUrl("http://figma.com/design/abc")).toBeNull();
  });
});

describe("extractFigmaReferences", () => {
  it("extracts, normalizes, and dedupes figma urls in a body", () => {
    const out = extractFigmaReferences(
      "see https://figma.com/design/a?node-id=1-2 and https://figma.com/design/a?node-id=1-2 and https://x.com/y",
    );
    expect(out).toEqual(["https://figma.com/design/a?node-id=1-2"]);
  });
  it("returns [] when there are no figma urls", () => {
    expect(extractFigmaReferences("plain text https://example.com")).toEqual([]);
  });
});

describe("parseFigmaOEmbed", () => {
  it("extracts title + thumbnail_url", () => {
    expect(parseFigmaOEmbed({ title: "My Design", thumbnail_url: "https://f/thumb.png" }))
      .toEqual({ title: "My Design", thumbnailUrl: "https://f/thumb.png" });
  });
  it("nulls missing/invalid fields", () => {
    expect(parseFigmaOEmbed({})).toEqual({ title: null, thumbnailUrl: null });
    expect(parseFigmaOEmbed("nope")).toEqual({ title: null, thumbnailUrl: null });
  });
});
```

- [ ] **Step 2: Run → fail** — `cd apps/web && npx vitest run src/features/design/figma-url.test.ts` (note: `pnpm --filter web test -- <pattern>` does NOT filter in this repo; use `npx vitest run <file>` from `apps/web`). Expected: FAIL (module missing).

- [ ] **Step 3: Implement `figma-url.ts`** (port from the spike; add `extractFigmaReferences` + `parseFigmaOEmbed`)

```ts
export const FIGMA_ALLOWED_HOSTS: ReadonlySet<string> = new Set(["figma.com", "www.figma.com"]);

export function normalizeFigmaUrl(input: string): string | null {
  let url: URL;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== "https:") return null;
  if (!FIGMA_ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;
  url.hostname = url.hostname.toLowerCase();
  url.username = ""; url.password = ""; url.hash = "";
  const nodeId = url.searchParams.get("node-id");
  url.search = "";
  if (nodeId) url.searchParams.set("node-id", nodeId);
  return url.toString();
}

const URL_TOKEN = /https?:\/\/[^\s<>"')]+/g;

export function extractFigmaReferences(body: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of body.match(URL_TOKEN) ?? []) {
    const normalized = normalizeFigmaUrl(token);
    if (normalized && !seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
  }
  return out;
}

export function parseFigmaOEmbed(json: unknown): { title: string | null; thumbnailUrl: string | null } {
  if (!json || typeof json !== "object") return { title: null, thumbnailUrl: null };
  const record = json as Record<string, unknown>;
  return {
    title: typeof record.title === "string" ? record.title : null,
    thumbnailUrl: typeof record.thumbnail_url === "string" ? record.thumbnail_url : null,
  };
}
```

- [ ] **Step 4: Run → pass** — the vitest command above. Expected: PASS.

- [ ] **Step 5: Write the failing fetch test** (`figma-oembed.test.ts`) — inject `fetchImpl`

```ts
import { describe, expect, it } from "vitest";
import { fetchFigmaOEmbed } from "./figma-oembed";

function jsonResponse(body: unknown, status = 200) {
  const text = JSON.stringify(body);
  return new Response(text, { status, headers: { "content-type": "application/json" } });
}

describe("fetchFigmaOEmbed", () => {
  it("returns ok with title + thumbnail on a good response", async () => {
    const fetchImpl = (async () => jsonResponse({ title: "T", thumbnail_url: "https://f/t.png" })) as unknown as typeof fetch;
    const r = await fetchFigmaOEmbed("https://www.figma.com/design/a", { fetchImpl });
    expect(r).toMatchObject({ ok: true, title: "T", thumbnailUrl: "https://f/t.png" });
  });
  it("reports non-2xx as failed", async () => {
    const fetchImpl = (async () => new Response("no", { status: 404 })) as unknown as typeof fetch;
    const r = await fetchFigmaOEmbed("https://www.figma.com/design/a", { fetchImpl });
    expect(r.ok).toBe(false);
  });
  it("reports a thrown/abort as error/timeout", async () => {
    const fetchImpl = (async () => { const e = new Error("x"); e.name = "AbortError"; throw e; }) as unknown as typeof fetch;
    const r = await fetchFigmaOEmbed("https://www.figma.com/design/a", { fetchImpl });
    expect(r.status).toBe("timeout");
  });
});
```

- [ ] **Step 6: Run → fail**, then **Step 7: Implement `figma-oembed.ts`** by lifting `readCapped` + `fetchOembed` from `scripts/design/figma-oembed-check.mjs` (keep `redirect: "error"`, the `AbortController` timeout, and the 64 KiB `readCapped` cap; drop the CLI wrapper). Add `import "server-only";` at the top and the `fetchImpl` injection. Use `parseFigmaOEmbed` from `figma-url.ts` for the body parse.

- [ ] **Step 8: Run → pass** — `cd apps/web && npx vitest run src/features/design/figma-url.test.ts src/features/design/figma-oembed.test.ts`. Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/features/design/figma-url.ts apps/web/src/features/design/figma-url.test.ts apps/web/src/features/design/figma-oembed.ts apps/web/src/features/design/figma-oembed.test.ts
git commit -m "feat(design): shared Figma URL normalizer + hardened oEmbed fetch (lifted from spike)"
```

---

### Task 3: Contract + references reader

**Files:** Create `packages/contracts/src/design-references.ts` (+ test), modify `packages/contracts/src/index.ts`; create `apps/web/src/features/design/design-references-reader.ts` (+ test); modify `apps/web/src/features/rooms/e2e-fake.ts`.

**Interfaces:**
- Produces (`@meld/contracts`):
  - `const OEmbedStatusSchema = z.enum(["pending","ok","failed"])`.
  - `const DesignReferenceSchema` (`.strict()`): `{ id: uuid; roomId: uuid; normalizedUrl: string; title: string | null; oembedStatus: OEmbedStatus; fetchedAt: string | null; createdAt: string }`. `type DesignReference`.
  - `type DesignReferenceView = DesignReference & { thumbnailUrl: string | null }` (the reader adds a signed URL; `thumbnail_ref` itself never leaves the server).
- Produces (web): `listRoomDesignReferences(roomId: string): Promise<DesignReferenceView[]>` — reads `design_references` (RLS), mints a signed URL for each `ok` row's `thumbnail_ref` from `design-reference-thumbnails` (60-min TTL), returns `DesignReferenceView[]` (ascending `created_at`). Fake branch → `fakeListRoomDesignReferences`.

- [ ] **Step 1: Write the failing contract test** — parse a well-formed reference, reject unknown `oembedStatus`, reject extra keys. Use RFC4122-valid UUIDs.

- [ ] **Step 2: Run → fail** — `cd packages/contracts && npx vitest run src/design-references.test.ts`.

- [ ] **Step 3: Implement the contract** (mirror `packages/contracts/src/design-events.ts`); add `export * from "./design-references";` to `index.ts`.

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Write the failing reader test** — mock the Supabase client's `from("design_references").select().eq().order()` chain and `storage.from("design-reference-thumbnails").createSignedUrls(...)`; assert snake→camel mapping, that an `ok` row gets a signed `thumbnailUrl`, a `pending`/`failed` row gets `thumbnailUrl: null`, bad roomId → `[]`, error → `[]`.

- [ ] **Step 6: Run → fail**, then **Step 7: Implement** `design-references-reader.ts` mirroring `design-events-reader.ts` for the query, and `supabase-backend.ts:145` (`signLinkedRows` / `createSignedUrls`) for batch-signing the `thumbnail_ref` paths of `ok` rows. Add `fakeListRoomDesignReferences(roomId)` to `e2e-fake.ts` reading a new `store.designReferences` array (add `designReferences: []` to the store init + `??= []` in `getStore()`, following `store.designEvents`), returning `DesignReferenceView[]` (fake thumbnailUrl a stable string for `ok`).

- [ ] **Step 8: Run → pass** — `cd apps/web && npx vitest run src/features/design/design-references-reader.test.ts`.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src/design-references.ts packages/contracts/src/design-references.test.ts packages/contracts/src/index.ts apps/web/src/features/design/design-references-reader.ts apps/web/src/features/design/design-references-reader.test.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "feat(design): DesignReference contract + listRoomDesignReferences reader (signed thumbnails)"
```

---

### Task 4: Detection on post + remove action

**Files:** Create `apps/web/src/features/design/design-references-actions.ts` (+ test); modify `apps/web/src/features/rooms/actions.ts` and `apps/web/src/features/rooms/e2e-fake.ts`.

**Interfaces:**
- Produces:
  - `recordFigmaReferences(input: { roomId: string; body: string }): Promise<void>` — `extractFigmaReferences(body)` → for each, `add_design_reference(roomId, url, null, null, 'pending')`. Best-effort: never throws to the caller (swallow + `console.error`). Fake branch.
  - `removeDesignReference(referenceId: string): Promise<{ status: "removed" } | { status: "error" }>` → `delete_design_reference`. Fake branch.
- Consumes: `extractFigmaReferences` (Task 2); the existing RPCs.

- [ ] **Step 1: Write the failing action test** — `recordFigmaReferences` calls `add_design_reference` once per unique Figma URL with `status:'pending'` and none for a body with no Figma URLs; `recordFigmaReferences` swallows an RPC error (resolves, does not throw); `removeDesignReference` calls `delete_design_reference` and maps success/error.

- [ ] **Step 2: Run → fail**, then **Step 3: Implement** `design-references-actions.ts` (`"use server"`, `isRoomFakeEnabled()` branch, `createClient(new Headers())`, `supabase.rpc("add_design_reference", { target_room_id, url, ref_title: null, thumb: null, status: "pending" })` in a per-URL loop wrapped so one failure doesn't abort the rest). Add `fakeRecordFigmaReferences`/`fakeRemoveDesignReference` to `e2e-fake.ts` mutating `store.designReferences` (dedupe by `normalizedUrl`, mirroring `add_design_reference`'s upsert).

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Wire detection into `postMessage`** — in `apps/web/src/features/rooms/actions.ts`, after `const message = await backend.postMessage(parsed);` (line ~284) and before the reply-task creation, add a best-effort call:

```ts
// Best-effort Figma-link unfurl: never blocks or rolls back the post.
void recordFigmaReferences({ roomId: parsed.roomId, body: message.body }).catch(() => {});
```

Import `recordFigmaReferences` from `@/features/design/design-references-actions`. (Use `message.body` — the persisted, btrimmed body the card render will also see.)

- [ ] **Step 6: Test the wiring** — in the `postMessage` test (or a new case in `actions.test.ts`), mock `recordFigmaReferences` and assert it is invoked with the posted room + body, and that a rejection from it does NOT fail `postMessage`.

- [ ] **Step 7: Run → pass** — `cd apps/web && npx vitest run src/features/design/design-references-actions.test.ts src/features/rooms/actions.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/design/design-references-actions.ts apps/web/src/features/design/design-references-actions.test.ts apps/web/src/features/rooms/actions.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "feat(design): detect Figma links on post + remove-reference action"
```

---

### Task 5: The lazy refresh action (oEmbed fetch + thumbnail cache)

**Files:** Modify `apps/web/src/features/design/design-references-actions.ts` (+ test) and `apps/web/src/features/rooms/e2e-fake.ts`.

**Interfaces:**
- Produces: `refreshDesignReference(referenceId: string): Promise<DesignReferenceView | null>` — editor-gated; fetches oEmbed, downloads + caches the thumbnail, upserts the row, returns the updated view (or `null` on hard failure / non-editor). Fake branch.
- Consumes: `fetchFigmaOEmbed` (Task 2); the `design-reference-thumbnails` bucket (Task 1); `add_design_reference`; the reader's signing helper.

- [ ] **Step 1: Write the failing test** — mock the client (`from("design_references").select().eq().single()` to load the row's `room_id`/`normalized_url`), `fetchFigmaOEmbed` (inject or module-mock), `storage.from(...).upload(...)` + `createSignedUrl(...)`, and `rpc("add_design_reference", ...)`. Assert:
  - happy path: loads row → fetch ok → uploads bytes to `<roomId>/<referenceId>` → upserts `status:'ok'`, `thumb:<path>`, sanitized `title` → returns a view with a signed `thumbnailUrl`.
  - oEmbed failure (any `fetchFigmaOEmbed` non-ok): upserts `status:'failed'` (no upload) → returns a `failed` view with `thumbnailUrl: null`.
  - a non-editor / missing row → `null`, no upload, no upsert.

```ts
// sketch of the happy-path assertion
expect(rpc).toHaveBeenCalledWith("add_design_reference", expect.objectContaining({
  target_room_id: ROOM, url: NORMALIZED, status: "ok", thumb: `${ROOM}/${REF_ID}`,
}));
```

- [ ] **Step 2: Run → fail**, then **Step 3: Implement `refreshDesignReference`**:

```ts
export async function refreshDesignReference(referenceId: string): Promise<DesignReferenceView | null> {
  const id = z.string().uuid().safeParse(referenceId);
  if (!id.success) return null;
  try {
    if (isRoomFakeEnabled()) {
      const { fakeRefreshDesignReference } = await import("@/features/rooms/e2e-fake");
      return await fakeRefreshDesignReference(id.data);
    }
    const supabase = await createClient(new Headers());
    const { data: row } = await supabase
      .from("design_references")
      .select("id,room_id,normalized_url")
      .eq("id", id.data).single();
    if (!row) return null; // RLS/missing; add_design_reference re-checks edit access anyway

    const result = await fetchFigmaOEmbed(row.normalized_url);
    let thumbRef: string | null = null;
    if (result.ok && result.thumbnailUrl) {
      const image = await downloadCappedImage(result.thumbnailUrl); // 5s/64KiB, no off-allowlist redirect
      if (image) {
        const path = `${row.room_id}/${row.id}`;
        const up = await supabase.storage.from("design-reference-thumbnails")
          .upload(path, image.bytes, { contentType: image.contentType, upsert: true });
        if (!up.error) thumbRef = path;
      }
    }
    const status = thumbRef ? "ok" : "failed";
    const { data: updated, error } = await supabase.rpc("add_design_reference", {
      target_room_id: row.room_id, url: row.normalized_url,
      ref_title: result.title, thumb: thumbRef, status,
    });
    if (error || !updated) return null;
    return toReferenceView(updated, supabase); // signs thumb_ref if ok
  } catch (thrown) {
    console.error("refreshDesignReference threw", { referenceId, thrown });
    return null;
  }
}
```

Add `downloadCappedImage(url)` (reuse `readCapped` semantics: 5 s timeout, ≤64 KiB, `redirect: "error"`; return `{ bytes, contentType } | null`) to `figma-oembed.ts`, and a shared `toReferenceView(row, supabase)` signer used by both the reader and this action (extract from Task 3's reader). Add `fakeRefreshDesignReference(referenceId)` to `e2e-fake.ts`: flip the stored reference to `ok` with a stable fake `title` + `thumbnailUrl` (simulating a successful fetch) and return the view — so the e2e's "refresh upgrades the card" step works without network.

- [ ] **Step 4: Run → pass** — `cd apps/web && npx vitest run src/features/design/design-references-actions.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/design/design-references-actions.ts apps/web/src/features/design/design-references-actions.test.ts apps/web/src/features/design/figma-oembed.ts apps/web/src/features/design/design-references-reader.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "feat(design): refreshDesignReference — cache Figma thumbnail, upsert status"
```

---

### Task 6: Preview card + conversation wiring

**Files:** Create `apps/web/src/features/design/components/figma-reference-card.tsx` (+ test); modify `apps/web/src/features/rooms/components/conversation.tsx`.

**Interfaces:**
- Produces: `FigmaReferenceCard(props: { reference: DesignReferenceView; canEdit: boolean; onRemoved?: (id: string) => void; onRefreshed?: (r: DesignReferenceView) => void; refresh?: typeof refreshDesignReference; remove?: typeof removeDesignReference })` — renders the card by `oembedStatus`; when `canEdit` and (`pending` or `ok` with `fetchedAt` older than 7 days), a one-shot effect calls `refresh(reference.id)` and reports the upgraded view via `onRefreshed`. Editor remove → `remove(id)` then `onRemoved`. `refresh`/`remove` default to the real actions (dependency-injected for tests).

- [ ] **Step 1: Write the failing card test** — `pending` renders a link card (host + "Open in Figma") and, with `canEdit`, calls the injected `refresh` once; `ok` renders the thumbnail (`Thumbnail` with the signed `thumbnailUrl`) + sanitized title; `failed` renders the plain link card and does NOT call `refresh`; a viewer (`canEdit=false`) never calls `refresh`; remove calls the injected `remove`. Use `@testing-library/react` as `message-attachments`/`history-drawer` tests do. RFC4122-valid UUIDs.

- [ ] **Step 2: Run → fail**, then **Step 3: Implement** the card from `@astryxdesign/core`, following `apps/web/src/features/rooms/components/message-attachments.tsx` (use `Thumbnail`, `Token`, `openInNewTab(url)` with `noopener,noreferrer`; render the title via `Text` — escaped, never `dangerouslySetInnerHTML`). Gate the refresh effect on `canEdit` and a `useRef` one-shot, with `refresh`/`remove` from props. Stable default prop references (module-level) so the effect does not re-fire every render (the slice-3c HistoryDrawer lesson).

- [ ] **Step 4: Run → pass** — `cd apps/web && npx vitest run src/features/design/components/figma-reference-card.test.tsx`; then `pnpm check:astryx` (confirm zero NEW violations for `figma-reference-card.tsx` — ignore the pre-existing `stage-coaching-panel.tsx` ones).

- [ ] **Step 5: Wire into the conversation** — in `conversation.tsx`, load references (`listRoomDesignReferences` — server-passed initial + refetch, mirroring how messages/attachments arrive) and, inside `ChatMessage` right after the `MessageAttachments` block (~line 1533), render a `FigmaReferenceCard` for each reference whose `normalizedUrl` is in `extractFigmaReferences(message.body)`. Pass `canEdit` from the room access already available in the component. Update local reference state on `onRefreshed`/`onRemoved` (dedupe by id).

- [ ] **Step 6: Test the wiring** — a conversation test: a message whose body contains a Figma URL, with a matching `ok` reference injected, renders a `FigmaReferenceCard`; a message with no Figma URL renders none.

- [ ] **Step 7: Run → pass** — `cd apps/web && npx vitest run src/features/rooms/components/conversation.test.tsx src/features/design/components/figma-reference-card.test.tsx`; `pnpm check:astryx`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/features/design/components/figma-reference-card.tsx apps/web/src/features/design/components/figma-reference-card.test.tsx apps/web/src/features/rooms/components/conversation.tsx
git commit -m "feat(design): Figma preview card in the conversation (optimistic, editor refresh)"
```

---

### Task 7: End-to-end

**Files:** Create `e2e/design-figma-lane.spec.ts`.

**Interfaces:** none. Drives the fake path (`isRoomFakeEnabled`), mirroring `e2e/design-sketch-generate.spec.ts` / `design-canvas.spec.ts` harness + run config.

- [ ] **Step 1: Write the failing e2e** — in a room, post a message containing a Figma `/design/` URL → a **link card** (pending) appears → the editor lazy-refresh (fake) upgrades it to a **thumbnail card** with the fake title → the editor removes it and the card disappears. Use `data-testid`s on the card states (`figma-card-pending`/`figma-card-ok`, `figma-card-remove`).

- [ ] **Step 2: Run → fail** — the repo's Playwright invocation for the existing design specs (`pnpm test:e2e` / the config `design-sketch-generate.spec.ts` uses). Expected: FAIL.

- [ ] **Step 3: Make it pass** — ensure the fake path records the reference on `fakePostMessage`→detection (or that `fakeRecordFigmaReferences` is invoked in the fake post flow), that `fakeRefreshDesignReference` flips it to `ok`, and that the card testids/selectors match. Fix any wiring gaps surgically.

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Full gate + commit**

Run: `~/.local/share/supabase/supabase test db` (pgTAP incl. Task 1) · `cd packages/contracts && npx vitest run` · `cd apps/web && npx vitest run` · `pnpm check:astryx` · the Playwright command. All green.

```bash
git add e2e/design-figma-lane.spec.ts apps/web/src/features/rooms/e2e-fake.ts
git commit -m "test(e2e): paste a Figma link, unfurl to a cached thumbnail card, remove"
```

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| Auto-unfurl, optimistic; detection in `postMessage` (not the RPC) | 4 |
| Host allowlist + normalization (node-id only) | 2 |
| Hardened fetch (5 s / 64 KiB / no-redirect) | 2, 5 |
| Sanitized untrusted title; no remote HTML/`src` | 2 (parse), 6 (render) |
| Single lazy on-view fetch + 7-day TTL refresh; editor-only | 5, 6 |
| Thumbnails cached in Storage, signed URLs, never hotlinked | 1, 3, 5 |
| Degrade to link card; still counts for readiness (4b) | 5 (`failed`), 6 |
| Editor remove | 4, 6 |
| Reuse existing table + RPCs (no recreate) | 3, 4, 5 |
| Human live-oEmbed gate before shipping | pre-ship step (below) |
| e2e | 7 |

**⚠️ Human gate (not a code task):** before this ships to users, run `node scripts/design/figma-oembed-check.mjs --live "<a real link-shared /design/ or /file/ URL>"` — the slice-0 OPEN item; the endpoint rejects community URLs, so a real shared link is required to confirm the live thumbnail payload.

**2. Placeholder scan:** No TBD/"handle edge cases"/"similar to Task N". Two spots reference existing-but-unread code with grep instructions rather than invented signatures — the `discovery-attachments` bucket/RLS block (Task 1) and the `signLinkedRows` signer (Task 3/5) — because the implementer must match code they open. `downloadCappedImage` and `toReferenceView` are defined where introduced (Task 5) and reused, not restated.

**3. Type consistency:** `normalizeFigmaUrl`/`extractFigmaReferences`/`parseFigmaOEmbed` (Task 2) are consumed unchanged by Tasks 4/5/6. `DesignReference`/`DesignReferenceView`/`OEmbedStatus` (Task 3) are the single reference types used by the reader (3), actions (4/5), card (6), and conversation (6). `FigmaOEmbedResult` (Task 2) is consumed only by Task 5. The Storage bucket id `design-reference-thumbnails` and path `<roomId>/<referenceId>` are identical in Tasks 1, 3, and 5.
