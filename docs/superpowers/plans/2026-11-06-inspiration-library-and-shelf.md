# Inspiration Library + Mac Shelf Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner save inspiration images into Orion from anywhere on their Mac (menu-bar shelf: drag or ⌥⌘O) or from the web page, browse them in a Library, and attach them to rooms.

**Architecture:** One Postgres-backed library (`inspiration_items`) plus room links (`room_inspiration`), written only through `security definer` RPCs. Every upload, from the shelf or the web, goes through one TypeScript function, `saveInspirationItem` (validate → intent → storage upload → finalize → optional room link). A native SwiftUI menu-bar app (`apps/shelf`) captures, normalizes, and queues images in an on-disk outbox and uploads them with an upload-only bearer token. The token is stored in the Keychain.

**Tech Stack:** Next.js 16 App Router, React 19, Astryx Core 0.1.8, Supabase (Postgres 17 + Storage, pgTAP), zod 4, vitest 4, Playwright; Swift 6.4 / SwiftUI / AppKit (status item only) / ImageIO / Carbon (hotkey only), swift-testing.

**Spec:** `docs/superpowers/specs/2026-11-06-inspiration-library-and-shelf-design.md`. Read Parts A–H before starting any task. If this plan and the spec disagree, the spec wins. Stop and report the conflict; don't pick one quietly.

## Global Constraints

- Limits (single source `INSPIRATION_LIMITS` in `packages/contracts/src/inspiration.ts`; Swift mirror `Limits.swift`): maxBytes `10_485_760`, maxEdge `4096`, fallbackEdge `2048`, noteMax `500`, sourceUrlMax `2048`, pageSize `60`, bulkMax `100`, deviceNameMax `100`.
- Stored MIME types: `image/png`, `image/jpeg`, `image/webp` only. Storage bucket: `inspiration` (private). Object path: `<workspace_id>/<item_id>.<png|jpg|webp>`.
- Capture token format: `orion_cap_` + 43 base64url chars. Header: `Authorization: Bearer <token>`. Store only `sha256(token)` hex.
- Connect codes reuse `mintPairingCode` / `normalizePairingCode` from `@meld/device-auth`. Lifetime: 10 minutes. Max 5 live unredeemed codes per user.
- Only one new npm dependency is allowed: `image-size` pinned **exactly** at `2.1.0` (no `^`). No new Swift packages.
- New env var: `MELD_SHELF_SERVICE_ROLE_KEY` (the local Supabase service-role key).
- Hotkey: ⌥⌘O. Shelf default base URL: `http://127.0.0.1:3000`. Keychain service: `com.orion.shelf`. Outbox: `~/Library/Application Support/Orion/shelf-outbox/`.
- Swift: Swift 6 language mode, macOS 26 deployment target, zero compiler warnings, and the rules in spec Part G2b. Load the `swiftui-pro` skill (`.claude/skills/swiftui-pro/`) before writing or reviewing Swift.
- Web UI: no raw `<div>`/`<span>`, no CSS files, no hex colors, no px literals in styles (`pnpm check:astryx`). Spacing, color, and radius come from `var(--spacing-*)`, `var(--color-*)`, and `var(--radius-*)` tokens. No shadows.
- Every new `*.ts`/`*.tsx` file gets a same-named test file beside it (`pnpm test:colocation`), except Next `page.tsx` files and pure type re-exports.
- Database: forward migrations only. Apply with `supabase migration up --local` (check `which supabase` → 2.109.1 first). **Never** `supabase db reset` on the shared dev DB.
- Owner-facing error strings (exact):
  - unauthorized: "Reconnect the shelf in Orion Settings → Shelf."
  - invalid_code: "That code didn't work. Make a new one in Orion Settings → Shelf."
  - rate_limited: "Too many tries. Wait a few minutes and try again."
  - unsupported_type: "Only images can be saved."
  - too_large: "Too large to save."
  - invalid_image: "That file isn't a readable image."
  - unavailable: "Orion couldn't save that right now. It will try again."
- Done-gate for every task (paste real output in the task report): `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm check:astryx`; plus, for Swift tasks, `cd apps/shelf && swift build 2>&1 | grep -c warning` → `0`, then `swift test`, then a `swiftui-pro` review of the changed Swift files with every finding fixed.

## File Map

| Area | Files (create unless marked *modify*) | Task |
|---|---|---|
| Contracts | `packages/contracts/src/inspiration.ts` (+test), `packages/contracts/src/index.ts` *modify* | 1 |
| Tokens | `packages/device-auth/src/capture-tokens.ts` (+test), `packages/device-auth/src/index.ts` *modify* | 2 |
| Database | `supabase/migrations/20261106000001_inspiration.sql`, `supabase/tests/inspiration.test.sql`, `supabase/tests/capture_tokens.test.sql` | 3 |
| Shelf core 1 | `apps/shelf/Package.swift`, `apps/shelf/Sources/ShelfCore/{Limits.swift, Capture/*, Outbox/*}`, tests; root `.gitignore` *modify* | 4 |
| Web write path | `apps/web/src/features/inspiration/{inspiration-shared, image-validation, inspiration-repository, inspiration-storage, save-inspiration-item}.ts` (+tests), `apps/web/package.json` *modify* | 5 |
| Shelf core 2 | `apps/shelf/Sources/ShelfCore/{Network/*, Auth/*, Upload/*, State/*}`, tests | 6 |
| Shelf API | `apps/web/src/lib/supabase/shelf-server.ts`, `features/inspiration/{shelf-auth, shelf-responses, shelf-rate-limit}.ts`, `app/api/shelf/{connect,rooms,items}/route.ts` (+tests), `.env.example` + `README.md` *modify* | 7 |
| Reads/actions | `features/inspiration/{inspiration-reader, inspiration-actions, shelf-connection, inspiration-fake}.ts` (+tests) | 8 |
| Library UI | `features/inspiration/{client-image-prep, use-inspiration-library}.ts`, `features/inspiration/components/*`, `app/(app)/[workspaceId]/inspiration/page.tsx`, `ui/workspace-navigation.tsx` *modify* | 9 |
| Room tab | `features/rooms/{surfaces, room-tabs, supabase-backend, fake-backend}.ts` *modify*, `room-tab-strip.tsx` *modify*, room `page.tsx` *modify*, `features/inspiration/components/{room-inspiration-surface, library-picker-dialog}.tsx` | 10 |
| Settings | `features/inspiration/components/shelf-settings-view.tsx`, `app/(app)/[workspaceId]/settings/shelf/page.tsx`, `features/workspaces/settings-tabs.tsx` *modify* | 11 |
| Shelf app | `apps/shelf/Sources/OrionShelf/**`, `apps/shelf/AppBundle/Info.plist`, `apps/shelf/scripts/build-app.sh`, `apps/shelf/README.md`, `Tests/OrionShelfTests/*` | 12 |
| Acceptance | `e2e/inspiration-library.spec.ts`, `docs/product-feature-checklist.md` *modify* | 13 |

Waves (tasks in one wave can run in parallel): **W1** 1, 2, 3, 4 · **W2** 5, 6 · **W3** 7, 8 · **W4** 9, 10, 11, 12 · **W5** 13.

---
### Task 1: Shared contracts and limits

**Files:**
- Create: `packages/contracts/src/inspiration.ts`
- Create: `packages/contracts/src/inspiration.test.ts`
- Modify: `packages/contracts/src/index.ts` (append one export line)

**Interfaces:**
- Consumes: nothing.
- Produces (exact exports): `INSPIRATION_LIMITS`, `InspirationMimeTypeSchema` / `InspirationMimeType`, `CaptureChannelSchema` / `CaptureChannel`, `InspirationItemViewSchema` / `InspirationItemView`, `ShelfConnectRequestSchema`, `ShelfConnectResponseSchema` / `ShelfConnectResponse`, `ShelfRoomSchema` / `ShelfRoom`, `ShelfUploadFieldsSchema` / `ShelfUploadFields`, `ShelfUploadResponseSchema` / `ShelfUploadResponse`, `ShelfErrorCodeSchema` / `ShelfErrorCode`, `ShelfErrorSchema` / `ShelfErrorBody`, `SHELF_ERROR_MESSAGES`, `normalizeSourceUrl(input: string | null | undefined): string | null`, `normalizeNote(input: string | null | undefined): string | null`.

- [ ] **Step 1: Write the failing test** (`packages/contracts/src/inspiration.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import {
  INSPIRATION_LIMITS,
  InspirationItemViewSchema,
  SHELF_ERROR_MESSAGES,
  ShelfConnectRequestSchema,
  ShelfErrorCodeSchema,
  ShelfErrorSchema,
  ShelfUploadFieldsSchema,
  normalizeNote,
  normalizeSourceUrl,
} from "./inspiration";

const ID = "11111111-1111-4111-8111-111111111111";

describe("INSPIRATION_LIMITS", () => {
  it("pins the values the spec and the Swift mirror rely on", () => {
    expect(INSPIRATION_LIMITS).toEqual({
      maxBytes: 10_485_760,
      maxEdge: 4096,
      fallbackEdge: 2048,
      noteMax: 500,
      sourceUrlMax: 2048,
      pageSize: 60,
      bulkMax: 100,
      deviceNameMax: 100,
    });
  });
});

describe("normalizeSourceUrl", () => {
  it("keeps http and https URLs", () => {
    expect(normalizeSourceUrl("https://pinterest.com/pin/1")).toBe("https://pinterest.com/pin/1");
    expect(normalizeSourceUrl("http://example.com/a.png")).toBe("http://example.com/a.png");
  });

  it("drops other schemes, junk, blanks, and over-long URLs", () => {
    expect(normalizeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeSourceUrl("file:///Users/me/a.png")).toBeNull();
    expect(normalizeSourceUrl("not a url")).toBeNull();
    expect(normalizeSourceUrl("   ")).toBeNull();
    expect(normalizeSourceUrl(null)).toBeNull();
    expect(normalizeSourceUrl(`https://x.com/${"a".repeat(2048)}`)).toBeNull();
  });
});

describe("normalizeNote", () => {
  it("trims and turns empty into null", () => {
    expect(normalizeNote("  love this nav  ")).toBe("love this nav");
    expect(normalizeNote("   ")).toBeNull();
    expect(normalizeNote(undefined)).toBeNull();
  });

  it("cuts notes to the limit instead of rejecting them", () => {
    expect(normalizeNote("a".repeat(600))).toHaveLength(500);
  });
});

describe("ShelfUploadFieldsSchema", () => {
  // Routes always pass every key (FormData.get returns null for a missing
  // field), so the contract is tested with explicit nulls.
  it("accepts all-null fields", () => {
    expect(ShelfUploadFieldsSchema.parse({ note: null, sourceUrl: null, roomId: null })).toEqual({
      note: null,
      sourceUrl: null,
      roomId: null,
    });
  });

  it("normalizes note and sourceUrl and validates roomId", () => {
    expect(
      ShelfUploadFieldsSchema.parse({ note: " hi ", sourceUrl: "ftp://x", roomId: ID }),
    ).toEqual({ note: "hi", sourceUrl: null, roomId: ID });
    expect(ShelfUploadFieldsSchema.safeParse({ roomId: "nope" }).success).toBe(false);
  });
});

describe("ShelfConnectRequestSchema", () => {
  it("requires a code and a device name", () => {
    expect(ShelfConnectRequestSchema.safeParse({ code: "ABCD1234", deviceName: "Studio Mac" }).success).toBe(true);
    expect(ShelfConnectRequestSchema.safeParse({ code: "", deviceName: "x" }).success).toBe(false);
    expect(ShelfConnectRequestSchema.safeParse({ code: "A", deviceName: "" }).success).toBe(false);
  });
});

describe("InspirationItemViewSchema", () => {
  it("accepts a complete view", () => {
    const view = {
      id: ID,
      workspaceId: ID,
      imageUrl: "https://signed.example/a.png",
      width: 800,
      height: 600,
      mimeType: "image/png",
      sourceUrl: null,
      note: null,
      captureChannel: "shelf",
      createdAt: "2026-11-06T10:00:00.000Z",
      roomIds: [ID],
    };
    expect(InspirationItemViewSchema.parse(view)).toEqual(view);
  });
});

describe("shelf errors", () => {
  it("has a message for every code", () => {
    for (const code of ShelfErrorCodeSchema.options) {
      expect(SHELF_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });

  it("validates the error envelope", () => {
    expect(
      ShelfErrorSchema.safeParse({ error: { code: "too_large", message: "Too large to save." } }).success,
    ).toBe(true);
    expect(ShelfErrorSchema.safeParse({ error: { code: "nope", message: "x" } }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @meld/contracts test -- inspiration`
Expected: FAIL, `Failed to resolve import "./inspiration"`.

- [ ] **Step 3: Implement** (`packages/contracts/src/inspiration.ts`)

```ts
import { z } from "zod";

// Single source of truth for every inspiration limit. The Swift shelf keeps a
// hand-copied mirror in apps/shelf/Sources/ShelfCore/Limits.swift -- change
// both together.
export const INSPIRATION_LIMITS = {
  maxBytes: 10_485_760,
  maxEdge: 4096,
  fallbackEdge: 2048,
  noteMax: 500,
  sourceUrlMax: 2048,
  pageSize: 60,
  bulkMax: 100,
  deviceNameMax: 100,
} as const;

export const InspirationMimeTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);
export type InspirationMimeType = z.infer<typeof InspirationMimeTypeSchema>;

export const CaptureChannelSchema = z.enum(["shelf", "web"]);
export type CaptureChannel = z.infer<typeof CaptureChannelSchema>;

export function normalizeSourceUrl(input: string | null | undefined): string | null {
  const trimmed = input?.trim() ?? "";
  if (trimmed === "" || trimmed.length > INSPIRATION_LIMITS.sourceUrlMax) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}

// Notes are a convenience, so an over-long one is cut rather than failing the save.
export function normalizeNote(input: string | null | undefined): string | null {
  const trimmed = input?.trim() ?? "";
  return trimmed === "" ? null : trimmed.slice(0, INSPIRATION_LIMITS.noteMax);
}

export const InspirationItemViewSchema = z
  .object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    imageUrl: z.string().nullable(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    mimeType: InspirationMimeTypeSchema,
    sourceUrl: z.string().nullable(),
    note: z.string().nullable(),
    captureChannel: CaptureChannelSchema,
    createdAt: z.string(),
    roomIds: z.array(z.string().uuid()),
  })
  .strict();
export type InspirationItemView = z.infer<typeof InspirationItemViewSchema>;

export const ShelfConnectRequestSchema = z
  .object({
    code: z.string().trim().min(1).max(32),
    deviceName: z.string().trim().min(1).max(INSPIRATION_LIMITS.deviceNameMax),
  })
  .strict();

export const ShelfConnectResponseSchema = z
  .object({ token: z.string(), workspaceId: z.string().uuid(), workspaceName: z.string() })
  .strict();
export type ShelfConnectResponse = z.infer<typeof ShelfConnectResponseSchema>;

export const ShelfRoomSchema = z
  .object({ roomId: z.string().uuid(), roomName: z.string(), projectName: z.string() })
  .strict();
export type ShelfRoom = z.infer<typeof ShelfRoomSchema>;

export const ShelfUploadFieldsSchema = z.object({
  note: z.string().nullish().transform(normalizeNote),
  sourceUrl: z.string().nullish().transform(normalizeSourceUrl),
  roomId: z.string().uuid().nullish().transform((value) => value ?? null),
});
export type ShelfUploadFields = z.infer<typeof ShelfUploadFieldsSchema>;

export const ShelfUploadResponseSchema = z
  .object({ itemId: z.string().uuid(), duplicate: z.boolean(), roomLinked: z.boolean() })
  .strict();
export type ShelfUploadResponse = z.infer<typeof ShelfUploadResponseSchema>;

export const ShelfErrorCodeSchema = z.enum([
  "unauthorized",
  "invalid_code",
  "rate_limited",
  "unsupported_type",
  "too_large",
  "invalid_image",
  "unavailable",
]);
export type ShelfErrorCode = z.infer<typeof ShelfErrorCodeSchema>;

export const ShelfErrorSchema = z
  .object({ error: z.object({ code: ShelfErrorCodeSchema, message: z.string() }).strict() })
  .strict();
export type ShelfErrorBody = z.infer<typeof ShelfErrorSchema>;

export const SHELF_ERROR_MESSAGES: Record<ShelfErrorCode, string> = {
  unauthorized: "Reconnect the shelf in Orion Settings → Shelf.",
  invalid_code: "That code didn't work. Make a new one in Orion Settings → Shelf.",
  rate_limited: "Too many tries. Wait a few minutes and try again.",
  unsupported_type: "Only images can be saved.",
  too_large: "Too large to save.",
  invalid_image: "That file isn't a readable image.",
  unavailable: "Orion couldn't save that right now. It will try again.",
};
```

Append to `packages/contracts/src/index.ts`:

```ts
export * from "./inspiration";
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @meld/contracts test -- inspiration && pnpm --filter @meld/contracts typecheck`
Expected: all `inspiration.test.ts` tests PASS; typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/inspiration.ts packages/contracts/src/inspiration.test.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): inspiration + shelf contracts and limits"
```

---

### Task 2: Capture-token helpers

**Files:**
- Create: `packages/device-auth/src/capture-tokens.ts`
- Create: `packages/device-auth/src/capture-tokens.test.ts`
- Modify: `packages/device-auth/src/index.ts`

**Interfaces:**
- Consumes: `hashToken(secret: string): string` from `./tokens`.
- Produces: `CAPTURE_TOKEN_PREFIX = "orion_cap_"`, `mintCaptureToken(): { token: string; tokenHash: string }`, `parseCaptureAuthorization(header: string | null | undefined): string | null` (returns the full token, or null).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { CAPTURE_TOKEN_PREFIX, mintCaptureToken, parseCaptureAuthorization } from "./capture-tokens";
import { hashToken } from "./tokens";

describe("capture tokens", () => {
  it("mints a prefixed 32-byte base64url token and its sha256 hash", () => {
    const minted = mintCaptureToken();
    expect(minted.token).toMatch(/^orion_cap_[A-Za-z0-9_-]{43}$/);
    expect(minted.tokenHash).toBe(hashToken(minted.token));
    expect(minted.tokenHash).not.toContain(minted.token);
  });

  it("mints a different token every time", () => {
    expect(mintCaptureToken().token).not.toBe(mintCaptureToken().token);
  });

  it("parses a well-formed bearer header", () => {
    const { token } = mintCaptureToken();
    expect(parseCaptureAuthorization(`Bearer ${token}`)).toBe(token);
  });

  it.each([
    [undefined],
    [null],
    [""],
    ["Bearer"],
    ["Bearer "],
    [`Basic ${CAPTURE_TOKEN_PREFIX}${"a".repeat(43)}`],
    [`Bearer ${"a".repeat(53)}`],
    [`Bearer ${CAPTURE_TOKEN_PREFIX}${"a".repeat(42)}`],
    [`Bearer ${CAPTURE_TOKEN_PREFIX}${"a".repeat(42)}=`],
    [`Device 33333333-3333-4333-8333-333333333333.${"a".repeat(43)}`],
  ])("rejects malformed header %s", (header) => {
    expect(parseCaptureAuthorization(header)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @meld/device-auth test -- capture-tokens`
Expected: FAIL, `Failed to resolve import "./capture-tokens"`.

- [ ] **Step 3: Implement** (`packages/device-auth/src/capture-tokens.ts`)

```ts
import { randomBytes } from "node:crypto";
import { hashToken } from "./tokens";

// The shelf's upload-only credential. The prefix makes a leaked token easy to
// recognise in a log or a paste and keeps it visually distinct from device
// credentials (`<uuid>.<secret>`), which this parser deliberately rejects.
export const CAPTURE_TOKEN_PREFIX = "orion_cap_";
const TOKEN_PATTERN = /^orion_cap_[A-Za-z0-9_-]{43}$/;
const SECRET_BYTES = 32;

export function mintCaptureToken(): { token: string; tokenHash: string } {
  const token = `${CAPTURE_TOKEN_PREFIX}${randomBytes(SECRET_BYTES).toString("base64url")}`;
  return { token, tokenHash: hashToken(token) };
}

export function parseCaptureAuthorization(header: string | null | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  return TOKEN_PATTERN.test(token) ? token : null;
}
```

Append to `packages/device-auth/src/index.ts`:

```ts
export {
  CAPTURE_TOKEN_PREFIX,
  mintCaptureToken,
  parseCaptureAuthorization,
} from "./capture-tokens";
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @meld/device-auth test && pnpm --filter @meld/device-auth typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/device-auth/src/capture-tokens.ts packages/device-auth/src/capture-tokens.test.ts packages/device-auth/src/index.ts
git commit -m "feat(device-auth): upload-only capture tokens for the shelf"
```

---
### Task 3: Database: tables, bucket, RLS, RPCs, pgTAP

**Files:**
- Create: `supabase/migrations/20261106000001_inspiration.sql`
- Create: `supabase/tests/inspiration.test.sql`
- Create: `supabase/tests/capture_tokens.test.sql`

**Read first:** `supabase/migrations/202608130009_design_references_handoffs.sql` (grant style), `supabase/migrations/202607240004_discovery.sql` lines 320–356 and 540–600 (`storage_room_id` + storage policies), and `supabase/tests/design_screen_delete.test.sql` (how tests impersonate a user).

**Interfaces (exact RPC signatures used by TypeScript in Tasks 5, 7, 8, 11):**

| RPC | Grant | Returns |
|---|---|---|
| `create_inspiration_intent(target_workspace_id uuid, item_hash text, item_mime text, item_size integer, item_width integer, item_height integer, item_source_url text, item_note text, item_channel text)` | authenticated | `jsonb {item: <row>, duplicate: bool}` |
| `capture_inspiration_intent(actor_user_id uuid, …same 9 params…)` | service_role | same |
| `finalize_inspiration_item(target_item_id uuid)` / `fail_inspiration_item(target_item_id uuid)` | authenticated | void |
| `capture_finalize_inspiration_item(actor_user_id uuid, target_item_id uuid)` / `capture_fail_inspiration_item(actor_user_id uuid, target_item_id uuid)` | service_role | void |
| `update_inspiration_note(target_item_id uuid, item_note text)` | authenticated | void |
| `delete_inspiration_items(target_item_ids uuid[])` | authenticated | `text[]` storage paths |
| `link_inspiration_to_room(target_room_id uuid, target_item_ids uuid[])` | authenticated | integer (new links) |
| `unlink_inspiration_from_room(target_room_id uuid, target_item_ids uuid[])` | authenticated | integer (removed links) |
| `capture_link_inspiration_to_room(actor_user_id uuid, target_room_id uuid, target_item_id uuid)` | service_role | integer |
| `create_capture_connect_code(target_workspace_id uuid, connect_code_hash text)` | authenticated | timestamptz (expires_at) |
| `redeem_capture_connect_code(connect_code_hash text, new_token_hash text, new_device_name text)` | service_role | `jsonb {workspace_id, workspace_name}` |
| `resolve_capture_token(presented_token_hash text)` | service_role | `jsonb {token_id, user_id, workspace_id}` or null |
| `revoke_capture_token(target_token_id uuid)` | authenticated | boolean |
| `list_capture_rooms(actor_user_id uuid, target_workspace_id uuid)` | service_role | `table(room_id uuid, room_name text, project_name text)` |

All errors use `errcode = 'P0001'` with these exact messages: `not_authorized`, `not_found`, `invalid_request`, `unsupported_type`, `invalid_code`, `too_many_codes`.

- [ ] **Step 1: Write the failing pgTAP tests**

`supabase/tests/inspiration.test.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- Fixtures: owner (member + room editor), viewer (member, view-only in room),
-- outsider (no membership), and a second workspace with its own room.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','insp-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','insp-viewer@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000003','authenticated','authenticated','insp-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by) values
  ('e2000000-0000-4000-8000-000000000001','Insp WS','e1000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000002','Other WS','e1000000-0000-4000-8000-000000000003');
insert into public.memberships (workspace_id, user_id, role) values
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','member');
insert into public.projects (id, workspace_id, name, created_by) values
  ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Insp Project','e1000000-0000-4000-8000-000000000001'),
  ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','Other Project','e1000000-0000-4000-8000-000000000003');
insert into public.rooms (id, workspace_id, project_id, name, owner_id) values
  ('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','Insp Room','e1000000-0000-4000-8000-000000000001'),
  ('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002','Other Room','e1000000-0000-4000-8000-000000000003');
insert into public.room_participants (room_id, user_id, access, added_by) values
  ('e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','view','e1000000-0000-4000-8000-000000000001')
on conflict (room_id, user_id) do update set access = excluded.access;

select has_table('public','inspiration_items','inspiration_items exists');
select has_table('public','room_inspiration','room_inspiration exists');

set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);

-- Intent → pending row with a workspace-scoped storage path.
select is(
  (select (public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('a',64), 'image/png', 1000, 10, 20, 'https://pinterest.com/pin/1', '  nice nav  ', 'web') -> 'item' ->> 'status')),
  'pending', 'intent creates a pending item');
select is(
  (select note from public.inspiration_items where content_hash = repeat('a',64)),
  'nice nav', 'note is trimmed');
select ok(
  (select storage_path ~ '^e2000000-0000-4000-8000-000000000001/[0-9a-f-]{36}\.png$' from public.inspiration_items where content_hash = repeat('a',64)),
  'storage path is <workspace>/<id>.png');

-- Retrying a never-finished upload reuses the same row (no duplicate flag).
select is(
  (select (public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('a',64), 'image/png', 1000, 10, 20, null, null, 'web') ->> 'duplicate')::boolean),
  false, 'a pending item is retried, not reported as a duplicate');
select is((select count(*)::int from public.inspiration_items where content_hash = repeat('a',64)), 1, 'retry does not add a row');

select lives_ok(
  $$ select public.finalize_inspiration_item((select id from public.inspiration_items where content_hash = repeat('a',64))) $$,
  'creator can finalize');
select is((select status from public.inspiration_items where content_hash = repeat('a',64)), 'ready', 'finalized item is ready');

-- Same bytes again → duplicate, note updated only when a non-empty note is given.
select is(
  (select (public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('a',64), 'image/png', 1000, 10, 20, null, '   ', 'shelf') ->> 'duplicate')::boolean),
  true, 'ready item with the same hash is a duplicate');
select is((select note from public.inspiration_items where content_hash = repeat('a',64)), 'nice nav', 'blank note keeps the old note');
select lives_ok(
  $$ select public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('a',64), 'image/png', 1000, 10, 20, null, 'better note', 'shelf') $$,
  'duplicate with a note');
select is((select note from public.inspiration_items where content_hash = repeat('a',64)), 'better note', 'non-empty note replaces the old note');

select throws_ok(
  $$ select public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('b',64), 'image/gif', 1, 1, 1, null, null, 'web') $$,
  'P0001', 'unsupported_type', 'gif is not a stored type');

-- Room links: idempotent, editor-only, same-workspace-only.
select is(
  public.link_inspiration_to_room('e4000000-0000-4000-8000-000000000001', array[(select id from public.inspiration_items where content_hash = repeat('a',64))]),
  1, 'editor links an item');
select is(
  public.link_inspiration_to_room('e4000000-0000-4000-8000-000000000001', array[(select id from public.inspiration_items where content_hash = repeat('a',64))]),
  0, 'linking again is a no-op');
select throws_ok(
  $$ select public.link_inspiration_to_room('e4000000-0000-4000-8000-000000000002', array[(select id from public.inspiration_items where content_hash = repeat('a',64))]) $$,
  'P0001', 'not_authorized', 'cannot link into a room the user cannot edit (other workspace)');

-- Viewer: can see the item, cannot link.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.inspiration_items), 1, 'workspace member can read the library');
select throws_ok(
  $$ select public.link_inspiration_to_room('e4000000-0000-4000-8000-000000000001', array[(select id from public.inspiration_items where content_hash = repeat('a',64))]) $$,
  'P0001', 'not_authorized', 'view-only participant cannot link');

-- Outsider: sees nothing, cannot create intents.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.inspiration_items), 0, 'non-member sees no items');
select throws_ok(
  $$ select public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('c',64), 'image/png', 1, 1, 1, null, null, 'web') $$,
  'P0001', 'not_authorized', 'non-member cannot create an intent');

-- Owner: unlink then delete returns the storage path and cascades links.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select is(
  public.unlink_inspiration_from_room('e4000000-0000-4000-8000-000000000001', array[(select id from public.inspiration_items where content_hash = repeat('a',64))]),
  1, 'editor unlinks an item');
select is(
  cardinality(public.delete_inspiration_items(array[(select id from public.inspiration_items where content_hash = repeat('a',64))])),
  1, 'delete returns one storage path');

reset role;
set local role anon;
select throws_ok(
  $$ select public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('d',64), 'image/png', 1, 1, 1, null, null, 'web') $$,
  '42501', null, 'anon cannot call the intent RPC');
reset role;

select * from finish();
rollback;
```

`supabase/tests/capture_tokens.test.sql`:

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000000001','authenticated','authenticated','shelf-owner@example.com','',now(),'{}','{}',now(),now()),
  ('f1000000-0000-4000-8000-000000000002','authenticated','authenticated','shelf-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by) values
  ('f2000000-0000-4000-8000-000000000001','Shelf WS','f1000000-0000-4000-8000-000000000001');
insert into public.projects (id, workspace_id, name, created_by) values
  ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','Shelf Project','f1000000-0000-4000-8000-000000000001');
insert into public.rooms (id, workspace_id, project_id, name, owner_id) values
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','Shelf Room','f1000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select ok(
  public.create_capture_connect_code('f2000000-0000-4000-8000-000000000001', repeat('1',64)) > now(),
  'member creates a connect code that expires in the future');

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.create_capture_connect_code('f2000000-0000-4000-8000-000000000001', repeat('2',64)) $$,
  'P0001', 'not_authorized', 'non-member cannot create a connect code');
select throws_ok(
  $$ select public.redeem_capture_connect_code(repeat('1',64), repeat('a',64), 'Mac') $$,
  '42501', null, 'authenticated users cannot redeem (service role only)');

reset role;
set local role service_role;
select is(
  public.redeem_capture_connect_code(repeat('1',64), repeat('a',64), 'Studio Mac') ->> 'workspace_name',
  'Shelf WS', 'service role redeems a valid code');
select throws_ok(
  $$ select public.redeem_capture_connect_code(repeat('1',64), repeat('b',64), 'Mac') $$,
  'P0001', 'invalid_code', 'a code is single-use');
select is(
  public.resolve_capture_token(repeat('a',64)) ->> 'user_id',
  'f1000000-0000-4000-8000-000000000001', 'active token resolves to its user');
select is(public.resolve_capture_token(repeat('f',64)), null::jsonb, 'unknown token resolves to null');

-- Expired code.
reset role;
insert into public.capture_connect_codes (user_id, workspace_id, code_hash, expires_at)
values ('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001', repeat('3',64), now() - interval '1 minute');
set local role service_role;
select throws_ok(
  $$ select public.redeem_capture_connect_code(repeat('3',64), repeat('c',64), 'Mac') $$,
  'P0001', 'invalid_code', 'an expired code fails');

-- Reconnecting revokes the previous token.
reset role;
insert into public.capture_connect_codes (user_id, workspace_id, code_hash, expires_at)
values ('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001', repeat('4',64), now() + interval '10 minutes');
set local role service_role;
select lives_ok($$ select public.redeem_capture_connect_code(repeat('4',64), repeat('d',64), 'New Mac') $$, 'second connect succeeds');
select is(public.resolve_capture_token(repeat('a',64)), null::jsonb, 'old token no longer resolves');
select is(public.resolve_capture_token(repeat('d',64)) ->> 'workspace_id', 'f2000000-0000-4000-8000-000000000001', 'new token resolves');

-- Room names only, for rooms the user can edit.
select is(
  (select room_name from public.list_capture_rooms('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001')),
  'Shelf Room', 'owner sees their editable room');
select is(
  (select count(*)::int from public.list_capture_rooms('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001')),
  0, 'outsider sees no rooms');

-- Owner revokes from Settings.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select is(
  public.revoke_capture_token((select id from public.capture_tokens where token_hash = repeat('d',64))),
  true, 'owner revokes their token');

select * from finish();
rollback;
```

Note on fixtures: the workspace creator gets a `memberships` row from the existing `add_workspace_creator_membership` trigger, and the room owner gets an `edit` participant row from `add_room_owner_participant`. That's why the owner rows above are never inserted by hand.

- [ ] **Step 2: Run them on a scratch database and confirm they fail**

Use the branch-pure scratch-DB recipe (memory item "meld-local-setup" point 15, or `.context/SETUP-NOTES.md`). Never run tests against the shared dev DB. Replay all branch migrations into the scratch DB, then:

Run: `docker exec -i supabase_db_meld psql -U postgres -d <scratch_db> -f - < supabase/tests/inspiration.test.sql`
Expected: FAIL at `has_table('public','inspiration_items', …)` (the table doesn't exist yet).

- [ ] **Step 3: Write the migration** (`supabase/migrations/20261106000001_inspiration.sql`)

```sql
-- Orion Step 1: Inspiration Library + Mac Shelf.
-- Spec: docs/superpowers/specs/2026-11-06-inspiration-library-and-shelf-design.md (Part D)
-- Writes go only through the security-definer functions below. Each public
-- RPC has a session flavour (actor = auth.uid()) and, where the shelf needs
-- it, a service-role "capture_" flavour that names the actor explicitly.

create table public.inspiration_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  storage_path text not null unique,
  mime_type text not null
    check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size between 1 and 10485760),
  width integer not null check (width between 1 and 4096),
  height integer not null check (height between 1 and 4096),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  source_url text check (source_url is null or char_length(source_url) <= 2048),
  note text check (note is null or char_length(note) <= 500),
  capture_channel text not null check (capture_channel in ('shelf', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, content_hash)
);
create index inspiration_items_workspace_created
  on public.inspiration_items (workspace_id, created_at desc);

create table public.room_inspiration (
  room_id uuid not null references public.rooms(id) on delete cascade,
  item_id uuid not null references public.inspiration_items(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, item_id)
);
create index room_inspiration_item on public.room_inspiration (item_id);

create table public.capture_connect_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);
create index capture_connect_codes_user on public.capture_connect_codes (user_id);

create table public.capture_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  device_name text not null check (char_length(device_name) between 1 and 100),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index capture_tokens_one_active
  on public.capture_tokens (user_id, workspace_id) where revoked_at is null;

-- RLS: reads for members, no direct writes for anyone.
alter table public.inspiration_items enable row level security;
alter table public.room_inspiration enable row level security;
alter table public.capture_connect_codes enable row level security;
alter table public.capture_tokens enable row level security;

revoke all on table public.inspiration_items from anon, authenticated;
revoke all on table public.room_inspiration from anon, authenticated;
revoke all on table public.capture_connect_codes from anon, authenticated;
revoke all on table public.capture_tokens from anon, authenticated;

grant select on table public.inspiration_items to authenticated;
create policy "Workspace members can view inspiration"
on public.inspiration_items for select to authenticated
using (public.is_workspace_member(workspace_id));

grant select on table public.room_inspiration to authenticated;
create policy "Room participants can view room inspiration"
on public.room_inspiration for select to authenticated
using (public.is_room_participant(room_id));

-- Column grant: the Settings page lists tokens but must never see token_hash.
grant select (id, user_id, workspace_id, device_name, last_used_at, revoked_at, created_at)
  on table public.capture_tokens to authenticated;
create policy "Owners can view their shelf tokens"
on public.capture_tokens for select to authenticated
using (user_id = auth.uid());

-- Internal helpers (actor-explicit so the service-role path, where auth.uid()
-- is null, uses the same checks as the session path).
create function public.inspiration_actor_is_member(actor uuid, target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where workspace_id = target_workspace_id and user_id = actor
  );
$$;

create function public.inspiration_actor_can_edit_room(actor uuid, target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_participants
    where room_id = target_room_id and user_id = actor and access = 'edit'
  );
$$;

create function public.inspiration_intent_for(
  actor uuid,
  target_workspace_id uuid,
  item_hash text,
  item_mime text,
  item_size integer,
  item_width integer,
  item_height integer,
  item_source_url text,
  item_note text,
  item_channel text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.inspiration_items;
  saved public.inspiration_items;
  new_id uuid := gen_random_uuid();
  extension text;
  cleaned_note text := nullif(btrim(coalesce(item_note, '')), '');
begin
  if actor is null
    or not public.inspiration_actor_is_member(actor, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  extension := case item_mime
    when 'image/png' then 'png'
    when 'image/jpeg' then 'jpg'
    when 'image/webp' then 'webp'
  end;
  if extension is null then
    raise exception 'unsupported_type' using errcode = 'P0001';
  end if;

  select * into existing
  from public.inspiration_items
  where workspace_id = target_workspace_id and content_hash = item_hash
  for update;

  if found and existing.status = 'ready' then
    if cleaned_note is not null then
      update public.inspiration_items
      set note = cleaned_note, updated_at = now()
      where id = existing.id
      returning * into existing;
    end if;
    return jsonb_build_object('item', to_jsonb(existing), 'duplicate', true);
  end if;

  if found then
    -- An earlier attempt never finished uploading. Reuse its row and path so
    -- the caller simply uploads again.
    update public.inspiration_items
    set status = 'pending',
        created_by = actor,
        source_url = item_source_url,
        note = cleaned_note,
        capture_channel = item_channel,
        updated_at = now()
    where id = existing.id
    returning * into saved;
    return jsonb_build_object('item', to_jsonb(saved), 'duplicate', false);
  end if;

  insert into public.inspiration_items (
    id, workspace_id, created_by, status, storage_path, mime_type, byte_size,
    width, height, content_hash, source_url, note, capture_channel
  ) values (
    new_id, target_workspace_id, actor, 'pending',
    target_workspace_id::text || '/' || new_id::text || '.' || extension,
    item_mime, item_size, item_width, item_height, item_hash,
    item_source_url, cleaned_note, item_channel
  )
  returning * into saved;
  return jsonb_build_object('item', to_jsonb(saved), 'duplicate', false);
end;
$$;

create function public.inspiration_settle_for(actor uuid, target_item_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if next_status not in ('ready', 'failed') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.inspiration_items
  set status = next_status, updated_at = now()
  where id = target_item_id and created_by = actor and status = 'pending';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.inspiration_link_for(actor uuid, target_room_id uuid, target_item_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_workspace uuid;
  inserted integer;
begin
  if coalesce(cardinality(target_item_ids), 0) not between 1 and 100 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if actor is null or not public.inspiration_actor_can_edit_room(actor, target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select workspace_id into room_workspace from public.rooms where id = target_room_id;
  if exists (
    select 1
    from unnest(target_item_ids) as wanted(id)
    left join public.inspiration_items item on item.id = wanted.id
    where item.id is null or item.status <> 'ready' or item.workspace_id <> room_workspace
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into public.room_inspiration (room_id, item_id, added_by)
  select target_room_id, wanted.id, actor from unnest(target_item_ids) as wanted(id)
  on conflict (room_id, item_id) do nothing;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

revoke all on function public.inspiration_actor_is_member(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.inspiration_actor_can_edit_room(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.inspiration_intent_for(uuid, uuid, text, text, integer, integer, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.inspiration_settle_for(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.inspiration_link_for(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;

-- Session RPCs (browser, actor = auth.uid()).
create function public.create_inspiration_intent(
  target_workspace_id uuid, item_hash text, item_mime text, item_size integer,
  item_width integer, item_height integer, item_source_url text, item_note text, item_channel text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.inspiration_intent_for(auth.uid(), target_workspace_id, item_hash, item_mime,
    item_size, item_width, item_height, item_source_url, item_note, item_channel);
$$;

create function public.finalize_inspiration_item(target_item_id uuid)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_settle_for(auth.uid(), target_item_id, 'ready'); $$;

create function public.fail_inspiration_item(target_item_id uuid)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_settle_for(auth.uid(), target_item_id, 'failed'); $$;

create function public.update_inspiration_note(target_item_id uuid, item_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(coalesce(item_note, '')) > 500 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.inspiration_items
  set note = nullif(btrim(coalesce(item_note, '')), ''), updated_at = now()
  where id = target_item_id
    and status = 'ready'
    and public.inspiration_actor_is_member(auth.uid(), workspace_id);
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.delete_inspiration_items(target_item_ids uuid[])
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  paths text[];
begin
  if coalesce(cardinality(target_item_ids), 0) not between 1 and 100 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from unnest(target_item_ids) as wanted(id)
    left join public.inspiration_items item on item.id = wanted.id
    where item.id is null
      or not public.inspiration_actor_is_member(auth.uid(), item.workspace_id)
  ) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  with removed as (
    delete from public.inspiration_items
    where id = any(target_item_ids)
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into paths from removed;
  return paths;
end;
$$;

create function public.link_inspiration_to_room(target_room_id uuid, target_item_ids uuid[])
returns integer language sql security definer set search_path = ''
as $$ select public.inspiration_link_for(auth.uid(), target_room_id, target_item_ids); $$;

create function public.unlink_inspiration_from_room(target_room_id uuid, target_item_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if coalesce(cardinality(target_item_ids), 0) not between 1 and 100 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not public.inspiration_actor_can_edit_room(auth.uid(), target_room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  delete from public.room_inspiration
  where room_id = target_room_id and item_id = any(target_item_ids);
  get diagnostics removed = row_count;
  return removed;
end;
$$;

create function public.create_capture_connect_code(target_workspace_id uuid, connect_code_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  expires timestamptz := now() + interval '10 minutes';
begin
  if not public.inspiration_actor_is_member(auth.uid(), target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if (
    select count(*) from public.capture_connect_codes
    where user_id = auth.uid() and redeemed_at is null and expires_at > now()
  ) >= 5 then
    raise exception 'too_many_codes' using errcode = 'P0001';
  end if;
  insert into public.capture_connect_codes (user_id, workspace_id, code_hash, expires_at)
  values (auth.uid(), target_workspace_id, connect_code_hash, expires);
  return expires;
end;
$$;

create function public.revoke_capture_token(target_token_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.capture_tokens
  set revoked_at = now()
  where id = target_token_id and user_id = auth.uid() and revoked_at is null;
  return found;
end;
$$;

-- Service-role RPCs (shelf routes; the route has already resolved the token).
create function public.capture_inspiration_intent(
  actor_user_id uuid, target_workspace_id uuid, item_hash text, item_mime text, item_size integer,
  item_width integer, item_height integer, item_source_url text, item_note text, item_channel text
)
returns jsonb language sql security definer set search_path = ''
as $$
  select public.inspiration_intent_for(actor_user_id, target_workspace_id, item_hash, item_mime,
    item_size, item_width, item_height, item_source_url, item_note, item_channel);
$$;

create function public.capture_finalize_inspiration_item(actor_user_id uuid, target_item_id uuid)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_settle_for(actor_user_id, target_item_id, 'ready'); $$;

create function public.capture_fail_inspiration_item(actor_user_id uuid, target_item_id uuid)
returns void language sql security definer set search_path = ''
as $$ select public.inspiration_settle_for(actor_user_id, target_item_id, 'failed'); $$;

create function public.capture_link_inspiration_to_room(actor_user_id uuid, target_room_id uuid, target_item_id uuid)
returns integer language sql security definer set search_path = ''
as $$ select public.inspiration_link_for(actor_user_id, target_room_id, array[target_item_id]); $$;

create function public.redeem_capture_connect_code(connect_code_hash text, new_token_hash text, new_device_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  code public.capture_connect_codes;
  workspace_name text;
begin
  select * into code from public.capture_connect_codes
  where code_hash = connect_code_hash
  for update;
  if not found
    or code.redeemed_at is not null
    or code.expires_at <= now()
    or not public.inspiration_actor_is_member(code.user_id, code.workspace_id) then
    raise exception 'invalid_code' using errcode = 'P0001';
  end if;

  update public.capture_connect_codes set redeemed_at = now() where id = code.id;
  update public.capture_tokens
  set revoked_at = now()
  where user_id = code.user_id and workspace_id = code.workspace_id and revoked_at is null;
  insert into public.capture_tokens (user_id, workspace_id, device_name, token_hash)
  values (code.user_id, code.workspace_id, btrim(new_device_name), new_token_hash);

  select name into workspace_name from public.workspaces where id = code.workspace_id;
  return jsonb_build_object('workspace_id', code.workspace_id, 'workspace_name', workspace_name);
end;
$$;

create function public.resolve_capture_token(presented_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token public.capture_tokens;
begin
  select * into token from public.capture_tokens
  where token_hash = presented_token_hash and revoked_at is null;
  if not found or not public.inspiration_actor_is_member(token.user_id, token.workspace_id) then
    return null;
  end if;
  if token.last_used_at is null or token.last_used_at < now() - interval '1 minute' then
    update public.capture_tokens set last_used_at = now() where id = token.id;
  end if;
  return jsonb_build_object(
    'token_id', token.id, 'user_id', token.user_id, 'workspace_id', token.workspace_id
  );
end;
$$;

create function public.list_capture_rooms(actor_user_id uuid, target_workspace_id uuid)
returns table (room_id uuid, room_name text, project_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select room.id, room.name, project.name
  from public.rooms room
  join public.projects project on project.id = room.project_id
  join public.room_participants participant
    on participant.room_id = room.id
   and participant.user_id = actor_user_id
   and participant.access = 'edit'
  where room.workspace_id = target_workspace_id
    and public.inspiration_actor_is_member(actor_user_id, target_workspace_id)
  order by project.name, room.name;
$$;

revoke all on function public.create_inspiration_intent(uuid, text, text, integer, integer, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.finalize_inspiration_item(uuid) from public, anon, authenticated, service_role;
revoke all on function public.fail_inspiration_item(uuid) from public, anon, authenticated, service_role;
revoke all on function public.update_inspiration_note(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.delete_inspiration_items(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.link_inspiration_to_room(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.unlink_inspiration_from_room(uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.create_capture_connect_code(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.revoke_capture_token(uuid) from public, anon, authenticated, service_role;
revoke all on function public.capture_inspiration_intent(uuid, uuid, text, text, integer, integer, integer, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.capture_finalize_inspiration_item(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.capture_fail_inspiration_item(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.capture_link_inspiration_to_room(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.redeem_capture_connect_code(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.resolve_capture_token(text) from public, anon, authenticated, service_role;
revoke all on function public.list_capture_rooms(uuid, uuid) from public, anon, authenticated, service_role;

grant execute on function public.create_inspiration_intent(uuid, text, text, integer, integer, integer, text, text, text) to authenticated;
grant execute on function public.finalize_inspiration_item(uuid) to authenticated;
grant execute on function public.fail_inspiration_item(uuid) to authenticated;
grant execute on function public.update_inspiration_note(uuid, text) to authenticated;
grant execute on function public.delete_inspiration_items(uuid[]) to authenticated;
grant execute on function public.link_inspiration_to_room(uuid, uuid[]) to authenticated;
grant execute on function public.unlink_inspiration_from_room(uuid, uuid[]) to authenticated;
grant execute on function public.create_capture_connect_code(uuid, text) to authenticated;
grant execute on function public.revoke_capture_token(uuid) to authenticated;
grant execute on function public.capture_inspiration_intent(uuid, uuid, text, text, integer, integer, integer, text, text, text) to service_role;
grant execute on function public.capture_finalize_inspiration_item(uuid, uuid) to service_role;
grant execute on function public.capture_fail_inspiration_item(uuid, uuid) to service_role;
grant execute on function public.capture_link_inspiration_to_room(uuid, uuid, uuid) to service_role;
grant execute on function public.redeem_capture_connect_code(text, text, text) to service_role;
grant execute on function public.resolve_capture_token(text) to service_role;
grant execute on function public.list_capture_rooms(uuid, uuid) to service_role;

-- Storage: private bucket, members read/write under their workspace prefix.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('inspiration', 'inspiration', false, 10485760, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create function public.storage_inspiration_workspace_id(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if object_name is null
    or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/[0-9a-f-]{36}\.(png|jpg|webp)$'
  then
    return null;
  end if;
  return split_part(object_name, '/', 1)::uuid;
exception
  when others then
    return null;
end;
$$;
revoke all on function public.storage_inspiration_workspace_id(text) from public;
grant execute on function public.storage_inspiration_workspace_id(text) to authenticated;

create policy "Workspace members can read inspiration objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'inspiration'
  and public.is_workspace_member(public.storage_inspiration_workspace_id(name))
);

create policy "Workspace members can upload inspiration objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inspiration'
  and owner_id = auth.uid()::text
  and public.is_workspace_member(public.storage_inspiration_workspace_id(name))
);

-- Upsert (a retried upload into the same path) needs update.
create policy "Workspace members can replace their inspiration objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'inspiration'
  and public.is_workspace_member(public.storage_inspiration_workspace_id(name))
)
with check (
  bucket_id = 'inspiration'
  and owner_id = auth.uid()::text
  and public.is_workspace_member(public.storage_inspiration_workspace_id(name))
);

create policy "Workspace members can delete inspiration objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'inspiration'
  and public.is_workspace_member(public.storage_inspiration_workspace_id(name))
);
```

- [ ] **Step 4: Replay migrations into the scratch DB and run both test files**

Run (from your scratch-DB setup): replay all `supabase/migrations/*.sql` in filename order as `postgres`, then
`docker exec -i supabase_db_meld psql -U postgres -d <scratch_db> -f - < supabase/tests/inspiration.test.sql`
`docker exec -i supabase_db_meld psql -U postgres -d <scratch_db> -f - < supabase/tests/capture_tokens.test.sql`
Expected: `ok 1` … `ok 24` and `ok 1` … `ok 14`, no `not ok`.

Then run the repo's SQL lint: `pnpm test:sql`. Expected: exit 0.

If a fixture trigger name differs (for example the creator membership trigger), fix the **test fixture**, not the migration, and say so in the report.

- [ ] **Step 5: Apply to the shared dev DB without wiping it**

Run: `which supabase` (must be `~/.local/share/supabase/supabase`, version 2.109.1), then `supabase migration up --local`.
Expected: `Applying migration 20261106000001_inspiration.sql...` and exit 0.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261106000001_inspiration.sql supabase/tests/inspiration.test.sql supabase/tests/capture_tokens.test.sql
git commit -m "feat(db): inspiration library, room links, shelf tokens, storage bucket"
```

---
### Task 4: Shelf package scaffold + ShelfCore capture and outbox

**Load the `swiftui-pro` skill first** (`.claude/skills/swiftui-pro/SKILL.md`, plus `references/swift.md` and `references/hygiene.md`). This task has no SwiftUI, but its Swift and concurrency rules apply.

**Files:**
- Create: `apps/shelf/Package.swift`
- Create: `apps/shelf/Sources/ShelfCore/Limits.swift`
- Create: `apps/shelf/Sources/ShelfCore/Capture/CapturedImage.swift`
- Create: `apps/shelf/Sources/ShelfCore/Capture/ImageMimeType.swift`
- Create: `apps/shelf/Sources/ShelfCore/Capture/NormalizedImage.swift`
- Create: `apps/shelf/Sources/ShelfCore/Capture/NormalizationError.swift`
- Create: `apps/shelf/Sources/ShelfCore/Capture/ImageNormalizer.swift`
- Create: `apps/shelf/Sources/ShelfCore/Capture/PasteboardReader.swift`
- Create: `apps/shelf/Sources/ShelfCore/Outbox/OutboxEntry.swift`
- Create: `apps/shelf/Sources/ShelfCore/Outbox/Outbox.swift`
- Create: `apps/shelf/Tests/ShelfTestSupport/TestImages.swift`
- Create: `apps/shelf/Tests/ShelfCoreTests/LimitsTests.swift`
- Create: `apps/shelf/Tests/ShelfCoreTests/ImageNormalizerTests.swift`
- Create: `apps/shelf/Tests/ShelfCoreTests/PasteboardReaderTests.swift`
- Create: `apps/shelf/Tests/ShelfCoreTests/OutboxTests.swift`
- Modify: `.gitignore` (append `apps/shelf/.build/` and `apps/shelf/build/`)

**Interfaces (Produces):**
- `public enum Limits { static let maxBytes: Int; maxEdge: Int; fallbackEdge: Int; noteMax: Int; sourceURLMax: Int; recentCount: Int }`
- `public struct CapturedImage: Sendable, Equatable { data: Data; sourceURL: URL? ; init(data:sourceURL:) }`
- `public enum ImageMimeType: String, Codable, Sendable { case png = "image/png", jpeg = "image/jpeg", webp = "image/webp" }`, with `var fileExtension: String`
- `public struct NormalizedImage: Sendable, Equatable { data: Data; mimeType: ImageMimeType; width: Int; height: Int }`
- `public enum NormalizationError: Error, Equatable, Sendable { case notAnImage, tooLarge }`
- `public struct ImageNormalizer: Sendable { init(); func normalize(_: CapturedImage) throws(NormalizationError) -> NormalizedImage }`
- `public struct PasteboardReader: Sendable { init(); @MainActor func images(from: NSPasteboard) -> [CapturedImage] }`
- `public struct OutboxEntry: Codable, Sendable, Identifiable, Equatable { id: UUID; mimeType: ImageMimeType; note: String?; sourceURL: URL?; roomID: UUID?; createdAt: Date }`
- `public actor Outbox { static var defaultDirectory: URL; init(directory:); func enqueue(_:note:sourceURL:roomID:now:) throws -> OutboxEntry; func pending() throws -> [OutboxEntry]; func imageData(for:) throws -> Data; func remove(_:) throws; func reject(_:) throws }`

- [ ] **Step 1: Create the package manifest** (`apps/shelf/Package.swift`)

```swift
// swift-tools-version: 6.2
import PackageDescription

// The OrionShelf app target is added in Task 12; until then the package is
// just the logic library and its tests.
let package = Package(
    name: "OrionShelf",
    platforms: [.macOS(.v26)],
    products: [
        .library(name: "ShelfCore", targets: ["ShelfCore"]),
    ],
    targets: [
        .target(
            name: "ShelfCore",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        // Test doubles and image builders shared by both test targets.
        .target(
            name: "ShelfTestSupport",
            dependencies: ["ShelfCore"],
            path: "Tests/ShelfTestSupport",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "ShelfCoreTests",
            dependencies: ["ShelfCore", "ShelfTestSupport"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
```

Append to the root `.gitignore`:

```
# Orion shelf (SwiftPM)
apps/shelf/.build/
apps/shelf/build/
```

- [ ] **Step 2: Write the failing tests**

`apps/shelf/Tests/ShelfTestSupport/TestImages.swift`:

```swift
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Builds real encoded images in memory so tests never depend on binary fixtures.
public enum TestImages {
    public static func encoded(width: Int, height: Int, as type: UTType, isNoisy: Bool = false) -> Data {
        let image = makeImage(width: width, height: height, isNoisy: isNoisy)
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, type.identifier as CFString, 1, nil) else {
            fatalError("ImageIO cannot encode \(type.identifier) on this Mac")
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else {
            fatalError("Encoding \(type.identifier) failed")
        }
        return output as Data
    }

    private static func makeImage(width: Int, height: Int, isNoisy: Bool) -> CGImage {
        let bytesPerRow = width * 4
        var pixels = [UInt8](repeating: 200, count: bytesPerRow * height)
        if isNoisy {
            var generator = SystemRandomNumberGenerator()
            for index in pixels.indices {
                pixels[index] = UInt8.random(in: 0...255, using: &generator)
            }
        }
        guard
            let context = CGContext(
                data: &pixels,
                width: width,
                height: height,
                bitsPerComponent: 8,
                bytesPerRow: bytesPerRow,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
            ),
            let image = context.makeImage()
        else {
            fatalError("Could not build a \(width)x\(height) test image")
        }
        return image
    }
}
```

`apps/shelf/Tests/ShelfCoreTests/LimitsTests.swift`:

```swift
import Foundation
import Testing
@testable import ShelfCore

struct LimitsTests {
    /// Fails if someone changes INSPIRATION_LIMITS in the TypeScript contract without updating Limits.swift.
    @Test func matchesTheTypeScriptContract() throws {
        let contract = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .appending(path: "../../../../packages/contracts/src/inspiration.ts")
            .standardizedFileURL
        let source = try String(contentsOf: contract, encoding: .utf8)
        #expect(source.contains("maxBytes: 10_485_760"))
        #expect(source.contains("maxEdge: 4096"))
        #expect(source.contains("fallbackEdge: 2048"))
        #expect(source.contains("noteMax: 500"))
        #expect(source.contains("sourceUrlMax: 2048"))
        #expect(Limits.maxBytes == 10_485_760)
        #expect(Limits.maxEdge == 4096)
        #expect(Limits.fallbackEdge == 2048)
        #expect(Limits.noteMax == 500)
        #expect(Limits.sourceURLMax == 2048)
    }
}
```

`apps/shelf/Tests/ShelfCoreTests/ImageNormalizerTests.swift`:

```swift
import Foundation
import ShelfTestSupport
import Testing
import UniformTypeIdentifiers
@testable import ShelfCore

struct ImageNormalizerTests {
    let normalizer = ImageNormalizer()

    @Test func passesThroughSmallPNGUnchanged() throws {
        let data = TestImages.encoded(width: 40, height: 30, as: .png)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result == NormalizedImage(data: data, mimeType: .png, width: 40, height: 30))
    }

    @Test func passesThroughSmallJPEGUnchanged() throws {
        let data = TestImages.encoded(width: 40, height: 30, as: .jpeg)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result.data == data)
        #expect(result.mimeType == .jpeg)
    }

    @Test func convertsHEICToJPEG() throws {
        let data = TestImages.encoded(width: 64, height: 48, as: .heic)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result.mimeType == .jpeg)
        #expect(result.width == 64)
        #expect(result.height == 48)
    }

    @Test(arguments: [UTType.gif, UTType.tiff, UTType.bmp])
    func convertsOtherFormatsToPNG(type: UTType) throws {
        let data = TestImages.encoded(width: 20, height: 10, as: type)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result.mimeType == .png)
        #expect(result.width == 20)
        #expect(result.height == 10)
    }

    @Test func shrinksAnOverlongImageToTheMaxEdge() throws {
        let data = TestImages.encoded(width: 5000, height: 100, as: .png)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result.mimeType == .jpeg)
        #expect(result.width == Limits.maxEdge)
    }

    @Test func shrinksAHeavyImageUnderTheByteLimit() throws {
        let data = TestImages.encoded(width: 4000, height: 4000, as: .png, isNoisy: true)
        #expect(data.count > Limits.maxBytes)
        let result = try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        #expect(result.data.count <= Limits.maxBytes)
        #expect(max(result.width, result.height) <= Limits.maxEdge)
    }

    @Test func rejectsNonImageBytes() {
        let data = Data("definitely not an image".utf8)
        #expect(throws: NormalizationError.notAnImage) {
            try normalizer.normalize(CapturedImage(data: data, sourceURL: nil))
        }
    }
}
```

`apps/shelf/Tests/ShelfCoreTests/PasteboardReaderTests.swift`:

```swift
import AppKit
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

@MainActor
struct PasteboardReaderTests {
    let reader = PasteboardReader()

    private func makePasteboard() -> NSPasteboard {
        let pasteboard = NSPasteboard(name: NSPasteboard.Name("orion-test-\(UUID().uuidString)"))
        pasteboard.clearContents()
        return pasteboard
    }

    @Test func readsImageBytesAndTheBrowserURL() {
        let pasteboard = makePasteboard()
        let png = TestImages.encoded(width: 8, height: 8, as: .png)
        let item = NSPasteboardItem()
        item.setData(png, forType: .png)
        item.setString("https://www.pinterest.com/pin/123/", forType: .URL)
        pasteboard.writeObjects([item])

        let images = reader.images(from: pasteboard)

        #expect(images == [CapturedImage(data: png, sourceURL: URL(string: "https://www.pinterest.com/pin/123/"))])
    }

    @Test func ignoresNonWebURLs() {
        let pasteboard = makePasteboard()
        let item = NSPasteboardItem()
        item.setData(TestImages.encoded(width: 8, height: 8, as: .png), forType: .png)
        item.setString("javascript:alert(1)", forType: .URL)
        pasteboard.writeObjects([item])

        #expect(reader.images(from: pasteboard).first?.sourceURL == nil)
    }

    @Test func readsAnImageFileDraggedFromFinder() throws {
        let png = TestImages.encoded(width: 8, height: 8, as: .png)
        let file = URL.temporaryDirectory.appending(path: "\(UUID().uuidString).png")
        try png.write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        let pasteboard = makePasteboard()
        pasteboard.writeObjects([file as NSURL])

        #expect(reader.images(from: pasteboard) == [CapturedImage(data: png, sourceURL: nil)])
    }

    @Test func returnsNothingForPlainText() {
        let pasteboard = makePasteboard()
        pasteboard.setString("hello", forType: .string)

        #expect(reader.images(from: pasteboard).isEmpty)
    }
}
```

`apps/shelf/Tests/ShelfCoreTests/OutboxTests.swift`:

```swift
import Foundation
import Testing
@testable import ShelfCore

struct OutboxTests {
    let directory = URL.temporaryDirectory.appending(path: "outbox-\(UUID().uuidString)", directoryHint: .isDirectory)
    let image = NormalizedImage(data: Data([1, 2, 3]), mimeType: .png, width: 1, height: 1)

    @Test func enqueuedEntriesComeBackOldestFirstWithTheirBytes() async throws {
        let outbox = Outbox(directory: directory)
        let first = try await outbox.enqueue(image, note: "a", sourceURL: nil, roomID: nil, now: Date(timeIntervalSince1970: 1))
        let second = try await outbox.enqueue(image, note: nil, sourceURL: URL(string: "https://x.com"), roomID: UUID(), now: Date(timeIntervalSince1970: 2))

        #expect(try await outbox.pending() == [first, second])
        #expect(try await outbox.imageData(for: first) == image.data)
    }

    @Test func survivesARestart() async throws {
        let entry = try await Outbox(directory: directory).enqueue(image, note: nil, sourceURL: nil, roomID: nil, now: .now)
        #expect(try await Outbox(directory: directory).pending() == [entry])
    }

    @Test func removeDeletesTheEntry() async throws {
        let outbox = Outbox(directory: directory)
        let entry = try await outbox.enqueue(image, note: nil, sourceURL: nil, roomID: nil, now: .now)
        try await outbox.remove(entry)
        #expect(try await outbox.pending().isEmpty)
    }

    @Test func rejectMovesTheEntryAside() async throws {
        let outbox = Outbox(directory: directory)
        let entry = try await outbox.enqueue(image, note: nil, sourceURL: nil, roomID: nil, now: .now)
        try await outbox.reject(entry)
        #expect(try await outbox.pending().isEmpty)
        let rejected = directory.appending(path: "rejected/\(entry.id.uuidString).json")
        #expect(FileManager.default.fileExists(atPath: rejected.path(percentEncoded: false)))
    }

    @Test func ignoresImageFilesWithoutMetadata() async throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data([9]).write(to: directory.appending(path: "\(UUID().uuidString).img"))
        #expect(try await Outbox(directory: directory).pending().isEmpty)
    }

    @Test func anEmptyOrMissingDirectoryHasNothingPending() async throws {
        #expect(try await Outbox(directory: directory).pending().isEmpty)
    }
}
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `cd apps/shelf && swift test 2>&1 | tail -5`
Expected: build FAILS with `cannot find 'ImageNormalizer' in scope` (and similar).

- [ ] **Step 4: Implement**

`Sources/ShelfCore/Limits.swift`:

```swift
/// Mirrors `INSPIRATION_LIMITS` in packages/contracts/src/inspiration.ts.
/// `LimitsTests` fails if the two drift apart.
public enum Limits {
    public static let maxBytes = 10_485_760
    public static let maxEdge = 4096
    public static let fallbackEdge = 2048
    public static let noteMax = 500
    public static let sourceURLMax = 2048
    /// Shelf-only: how many recent saves the panel shows.
    public static let recentCount = 6
}
```

`Sources/ShelfCore/Capture/CapturedImage.swift`:

```swift
import Foundation

/// Image bytes exactly as they arrived from a drop, a paste, or the hotkey.
/// The format is sniffed later by `ImageNormalizer`, so no type hint is kept.
public struct CapturedImage: Sendable, Equatable {
    public let data: Data
    public let sourceURL: URL?

    public init(data: Data, sourceURL: URL?) {
        self.data = data
        self.sourceURL = sourceURL
    }
}
```

`Sources/ShelfCore/Capture/ImageMimeType.swift`:

```swift
/// The only formats Orion stores.
public enum ImageMimeType: String, Codable, Sendable {
    case png = "image/png"
    case jpeg = "image/jpeg"
    case webp = "image/webp"

    public var fileExtension: String {
        switch self {
        case .png: "png"
        case .jpeg: "jpg"
        case .webp: "webp"
        }
    }
}
```

`Sources/ShelfCore/Capture/NormalizedImage.swift`:

```swift
import Foundation

/// An image ready to upload: a stored format, within `Limits`.
public struct NormalizedImage: Sendable, Equatable {
    public let data: Data
    public let mimeType: ImageMimeType
    public let width: Int
    public let height: Int

    public init(data: Data, mimeType: ImageMimeType, width: Int, height: Int) {
        self.data = data
        self.mimeType = mimeType
        self.width = width
        self.height = height
    }
}
```

`Sources/ShelfCore/Capture/NormalizationError.swift`:

```swift
public enum NormalizationError: Error, Equatable, Sendable {
    /// The bytes could not be decoded as an image.
    case notAnImage
    /// Still over `Limits.maxBytes` after shrinking to `Limits.fallbackEdge`.
    case tooLarge
}
```

`Sources/ShelfCore/Capture/ImageNormalizer.swift`:

```swift
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Turns anything ImageIO can decode into a format Orion stores, within `Limits`.
///
/// Rules (spec B1): PNG/JPEG/WebP within limits pass through untouched;
/// HEIC/HEIF become JPEG; every other format becomes PNG; anything too long
/// or too heavy is shrunk to `maxEdge`, then `fallbackEdge`, as JPEG.
public struct ImageNormalizer: Sendable {
    private static let fullSizeQuality = 0.9
    private static let shrunkQuality = 0.85

    public init() {}

    public func normalize(_ captured: CapturedImage) throws(NormalizationError) -> NormalizedImage {
        guard
            let source = CGImageSourceCreateWithData(captured.data as CFData, nil),
            CGImageSourceGetCount(source) > 0,
            let typeIdentifier = CGImageSourceGetType(source) as String?,
            let type = UTType(typeIdentifier),
            let size = Self.pixelSize(of: source)
        else {
            throw .notAnImage
        }

        let fitsEdge = max(size.width, size.height) <= Limits.maxEdge
        if let storedType = Self.storedMimeType(for: type), fitsEdge, captured.data.count <= Limits.maxBytes {
            return NormalizedImage(data: captured.data, mimeType: storedType, width: size.width, height: size.height)
        }

        let isHEIC = type.conforms(to: .heic) || type.conforms(to: .heif)
        if fitsEdge,
           let encoded = Self.encode(source, maxEdge: nil, as: isHEIC ? .jpeg : .png),
           encoded.data.count <= Limits.maxBytes {
            return encoded
        }

        for edge in [Limits.maxEdge, Limits.fallbackEdge] {
            if let encoded = Self.encode(source, maxEdge: edge, as: .jpeg), encoded.data.count <= Limits.maxBytes {
                return encoded
            }
        }
        throw .tooLarge
    }

    private static func storedMimeType(for type: UTType) -> ImageMimeType? {
        if type.conforms(to: .png) {
            .png
        } else if type.conforms(to: .jpeg) {
            .jpeg
        } else if type.conforms(to: .webP) {
            .webp
        } else {
            nil
        }
    }

    private static func pixelSize(of source: CGImageSource) -> (width: Int, height: Int)? {
        guard
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? Int,
            let height = properties[kCGImagePropertyPixelHeight] as? Int,
            width > 0, height > 0
        else {
            return nil
        }
        return (width, height)
    }

    /// Encodes the first frame (so a GIF becomes a still), optionally shrunk so its
    /// longest side is at most `maxEdge`. ImageIO never upscales a thumbnail.
    private static func encode(_ source: CGImageSource, maxEdge: Int?, as mimeType: ImageMimeType) -> NormalizedImage? {
        let image: CGImage? = if let maxEdge {
            CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxEdge,
            ] as CFDictionary)
        } else {
            CGImageSourceCreateImageAtIndex(source, 0, nil)
        }
        guard let image else { return nil }

        let output = NSMutableData()
        let type: UTType = mimeType == .png ? .png : .jpeg
        guard let destination = CGImageDestinationCreateWithData(output, type.identifier as CFString, 1, nil) else {
            return nil
        }
        let quality = maxEdge == nil ? fullSizeQuality : shrunkQuality
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return NormalizedImage(data: output as Data, mimeType: mimeType, width: image.width, height: image.height)
    }
}
```

`Sources/ShelfCore/Capture/PasteboardReader.swift`:

```swift
import AppKit
import UniformTypeIdentifiers

/// Reads images from a pasteboard: image data placed by browsers and apps,
/// or image files dragged from Finder. Keeps the web URL when a browser supplies one.
public struct PasteboardReader: Sendable {
    public init() {}

    @MainActor
    public func images(from pasteboard: NSPasteboard) -> [CapturedImage] {
        (pasteboard.pasteboardItems ?? []).compactMap(Self.image(from:))
    }

    @MainActor
    private static func image(from item: NSPasteboardItem) -> CapturedImage? {
        if let fileData = imageFileData(from: item) {
            return CapturedImage(data: fileData, sourceURL: nil)
        }
        guard
            let imageType = item.types.first(where: { UTType($0.rawValue)?.conforms(to: .image) == true }),
            let data = item.data(forType: imageType)
        else {
            return nil
        }
        return CapturedImage(data: data, sourceURL: webURL(from: item))
    }

    @MainActor
    private static func imageFileData(from item: NSPasteboardItem) -> Data? {
        guard
            let fileURLString = item.string(forType: .fileURL),
            let fileURL = URL(string: fileURLString),
            let type = UTType(filenameExtension: fileURL.pathExtension),
            type.conforms(to: .image)
        else {
            return nil
        }
        return try? Data(contentsOf: fileURL)
    }

    @MainActor
    private static func webURL(from item: NSPasteboardItem) -> URL? {
        guard
            let string = item.string(forType: .URL),
            string.count <= Limits.sourceURLMax,
            let url = URL(string: string),
            url.scheme == "http" || url.scheme == "https"
        else {
            return nil
        }
        return url
    }
}
```

`Sources/ShelfCore/Outbox/OutboxEntry.swift`:

```swift
import Foundation

/// Metadata for one waiting image. Never contains the capture token.
public struct OutboxEntry: Codable, Sendable, Identifiable, Equatable {
    public let id: UUID
    public let mimeType: ImageMimeType
    public let note: String?
    public let sourceURL: URL?
    public let roomID: UUID?
    public let createdAt: Date

    public init(id: UUID, mimeType: ImageMimeType, note: String?, sourceURL: URL?, roomID: UUID?, createdAt: Date) {
        self.id = id
        self.mimeType = mimeType
        self.note = note
        self.sourceURL = sourceURL
        self.roomID = roomID
        self.createdAt = createdAt
    }
}
```

`Sources/ShelfCore/Outbox/Outbox.swift`:

```swift
import Foundation

/// Images waiting to be sent. Each entry is `<id>.img` plus `<id>.json`, each
/// written atomically with the image first, so metadata never points at
/// missing bytes. Only entries with metadata count as pending.
public actor Outbox {
    public static var defaultDirectory: URL {
        URL.applicationSupportDirectory.appending(path: "Orion/shelf-outbox", directoryHint: .isDirectory)
    }

    private let directory: URL
    private let rejectedDirectory: URL

    public init(directory: URL = Outbox.defaultDirectory) {
        self.directory = directory
        self.rejectedDirectory = directory.appending(path: "rejected", directoryHint: .isDirectory)
    }

    @discardableResult
    public func enqueue(
        _ image: NormalizedImage,
        note: String?,
        sourceURL: URL?,
        roomID: UUID?,
        now: Date = .now
    ) throws -> OutboxEntry {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let entry = OutboxEntry(id: UUID(), mimeType: image.mimeType, note: note, sourceURL: sourceURL, roomID: roomID, createdAt: now)
        try image.data.write(to: imageURL(for: entry.id, in: directory), options: .atomic)
        try JSONEncoder().encode(entry).write(to: metadataURL(for: entry.id, in: directory), options: .atomic)
        return entry
    }

    public func pending() throws -> [OutboxEntry] {
        guard FileManager.default.fileExists(atPath: directory.path(percentEncoded: false)) else { return [] }
        let decoder = JSONDecoder()
        return try FileManager.default
            .contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            .map { try decoder.decode(OutboxEntry.self, from: Data(contentsOf: $0)) }
            .sorted { $0.createdAt < $1.createdAt }
    }

    public func imageData(for entry: OutboxEntry) throws -> Data {
        try Data(contentsOf: imageURL(for: entry.id, in: directory))
    }

    public func remove(_ entry: OutboxEntry) throws {
        try FileManager.default.removeItem(at: metadataURL(for: entry.id, in: directory))
        let image = imageURL(for: entry.id, in: directory)
        if FileManager.default.fileExists(atPath: image.path(percentEncoded: false)) {
            try FileManager.default.removeItem(at: image)
        }
    }

    /// Moves an entry the server will never accept out of the queue, keeping the
    /// files so the owner can inspect them (Settings → Open outbox folder).
    public func reject(_ entry: OutboxEntry) throws {
        try FileManager.default.createDirectory(at: rejectedDirectory, withIntermediateDirectories: true)
        try FileManager.default.moveItem(
            at: metadataURL(for: entry.id, in: directory),
            to: metadataURL(for: entry.id, in: rejectedDirectory)
        )
        try FileManager.default.moveItem(
            at: imageURL(for: entry.id, in: directory),
            to: imageURL(for: entry.id, in: rejectedDirectory)
        )
    }

    private func imageURL(for id: UUID, in folder: URL) -> URL {
        folder.appending(path: "\(id.uuidString).img")
    }

    private func metadataURL(for id: UUID, in folder: URL) -> URL {
        folder.appending(path: "\(id.uuidString).json")
    }
}
```

- [ ] **Step 5: Run the tests and confirm they pass with zero warnings**

Run: `cd apps/shelf && swift build 2>&1 | grep -c "warning:"; swift test 2>&1 | tail -3`
Expected: `0`, then `Test run with N tests passed`.

- [ ] **Step 6: swiftui-pro review**

Run the `swiftui-pro` review over `apps/shelf/Sources/ShelfCore` (only `swift.md` and `hygiene.md` apply). Fix every finding, or record why it doesn't apply.

- [ ] **Step 7: Commit**

```bash
git add apps/shelf/Package.swift apps/shelf/Sources apps/shelf/Tests .gitignore
git commit -m "feat(shelf): ShelfCore capture, normalization, and on-disk outbox"
```

---
### Task 5: Web write path (validate → intent → upload → finalize → link)

**Files:**
- Modify: `apps/web/package.json` (add `"image-size": "2.1.0"` to `dependencies`, exact pin), then `pnpm install`
- Create: `apps/web/src/features/inspiration/inspiration-shared.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/image-validation.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/inspiration-repository.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/inspiration-storage.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/save-inspiration-item.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: Task 1 contracts; Task 3 RPC names and params.
- Produces:
  - `inspiration-shared.ts`: `INSPIRATION_BUCKET = "inspiration"`, `SIGNED_URL_TTL_SECONDS = 3600`, `INSPIRATION_ITEM_COLUMNS` (string), `InspirationItemRowSchema`, `type InspirationItemRow`, `toItemView(row: unknown, extras: { imageUrl: string | null; roomIds: string[] }): InspirationItemView | null`.
  - `image-validation.ts`: `sniffMimeType(bytes: Uint8Array): InspirationMimeType | null`, `validateImageBytes(bytes: Uint8Array): ImageValidationResult`, `type ImageValidationError = "unsupported_type" | "too_large" | "invalid_image"`, `type ValidatedImage = { mimeType; width; height; byteSize; contentHash }`.
  - `inspiration-repository.ts`: `type InspirationActor = { kind: "session" } | { kind: "capture"; userId: string }`, `type IntentInput`, `interface InspirationRepository { createIntent(input: IntentInput): Promise<{ item: InspirationItemRow; duplicate: boolean }>; finalize(itemId: string): Promise<void>; fail(itemId: string): Promise<void>; linkToRoom(roomId: string, itemIds: string[]): Promise<number> }`, `createInspirationRepository(client: SupabaseClient, actor: InspirationActor): InspirationRepository`, `class InspirationRepositoryError extends Error { code: string }`.
  - `inspiration-storage.ts`: `interface InspirationStorage { upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>; remove(paths: string[]): Promise<void>; signUrls(paths: string[]): Promise<Map<string, string>> }`, `createInspirationStorage(client: SupabaseClient): InspirationStorage`.
  - `save-inspiration-item.ts`: `type SaveInspirationInput = { workspaceId: string; bytes: Uint8Array; note: string | null; sourceUrl: string | null; roomId: string | null; channel: CaptureChannel }`, `type SaveInspirationResult = { ok: true; itemId: string; duplicate: boolean; roomLinked: boolean } | { ok: false; error: ImageValidationError | "unavailable" }`, `saveInspirationItem(input, deps: { repository: InspirationRepository; storage: InspirationStorage }): Promise<SaveInspirationResult>`.

- [ ] **Step 1: Add the dependency**

In `apps/web/package.json` `dependencies`, add (alphabetical, exact):

```json
    "image-size": "2.1.0",
```

Run: `pnpm install`
Expected: lockfile updated, exit 0. `grep '"image-size"' apps/web/package.json` shows `"2.1.0"` with no `^`.

- [ ] **Step 2: Write the failing tests**

`apps/web/src/features/inspiration/inspiration-shared.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { toItemView } from "./inspiration-shared";

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "22222222-2222-4222-8222-222222222222",
  status: "ready",
  storage_path: "22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111.png",
  mime_type: "image/png",
  width: 800,
  height: 600,
  source_url: "https://pinterest.com/pin/1",
  note: "nav",
  capture_channel: "shelf",
  created_at: "2026-11-06T10:00:00.000Z",
};

describe("toItemView", () => {
  it("maps a row to the camelCase view", () => {
    expect(toItemView(ROW, { imageUrl: "https://signed/x", roomIds: ["33333333-3333-4333-8333-333333333333"] })).toEqual({
      id: ROW.id,
      workspaceId: ROW.workspace_id,
      imageUrl: "https://signed/x",
      width: 800,
      height: 600,
      mimeType: "image/png",
      sourceUrl: "https://pinterest.com/pin/1",
      note: "nav",
      captureChannel: "shelf",
      createdAt: ROW.created_at,
      roomIds: ["33333333-3333-4333-8333-333333333333"],
    });
  });

  it("returns null for a malformed row", () => {
    expect(toItemView({ ...ROW, mime_type: "image/gif" }, { imageUrl: null, roomIds: [] })).toBeNull();
    expect(toItemView(null, { imageUrl: null, roomIds: [] })).toBeNull();
  });
});
```

`apps/web/src/features/inspiration/image-validation.test.ts`:

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sniffMimeType, validateImageBytes } from "./image-validation";

// A PNG header is enough for both sniffing and image-size, which reads IHDR.
function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

const JPEG_1X1 = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
    "base64",
  ),
);
const WEBP_1X1 = Uint8Array.from(
  Buffer.from("UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=", "base64"),
);

describe("sniffMimeType", () => {
  it("recognises png, jpeg, and webp from magic bytes", () => {
    expect(sniffMimeType(pngHeader(1, 1))).toBe("image/png");
    expect(sniffMimeType(JPEG_1X1)).toBe("image/jpeg");
    expect(sniffMimeType(WEBP_1X1)).toBe("image/webp");
  });

  it("rejects everything else, including a text file named .png", () => {
    expect(sniffMimeType(new TextEncoder().encode("hello.png"))).toBeNull();
    expect(sniffMimeType(new TextEncoder().encode("GIF89a......"))).toBeNull();
    expect(sniffMimeType(new Uint8Array())).toBeNull();
  });
});

describe("validateImageBytes", () => {
  it("returns type, dimensions, size, and sha256 for a valid image", () => {
    const bytes = pngHeader(800, 600);
    expect(validateImageBytes(bytes)).toEqual({
      ok: true,
      image: {
        mimeType: "image/png",
        width: 800,
        height: 600,
        byteSize: bytes.byteLength,
        contentHash: createHash("sha256").update(bytes).digest("hex"),
      },
    });
  });

  it("reads jpeg and webp dimensions", () => {
    expect(validateImageBytes(JPEG_1X1)).toMatchObject({ ok: true, image: { width: 1, height: 1 } });
    expect(validateImageBytes(WEBP_1X1)).toMatchObject({ ok: true, image: { width: 1, height: 1 } });
  });

  it("rejects unknown types, oversize edges, oversize files, and empty input", () => {
    expect(validateImageBytes(new TextEncoder().encode("nope"))).toEqual({ ok: false, error: "unsupported_type" });
    expect(validateImageBytes(pngHeader(5000, 10))).toEqual({ ok: false, error: "too_large" });
    expect(validateImageBytes(new Uint8Array(10_485_761))).toEqual({ ok: false, error: "too_large" });
    expect(validateImageBytes(new Uint8Array())).toEqual({ ok: false, error: "invalid_image" });
  });

  it("rejects bytes that sniff as an image but cannot be measured", () => {
    expect(validateImageBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toEqual({ ok: false, error: "invalid_image" });
  });
});
```

`apps/web/src/features/inspiration/inspiration-repository.test.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { InspirationRepositoryError, createInspirationRepository } from "./inspiration-repository";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ITEM = "11111111-1111-4111-8111-111111111111";
const ROOM = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const ROW = {
  id: ITEM,
  workspace_id: WORKSPACE,
  status: "pending",
  storage_path: `${WORKSPACE}/${ITEM}.png`,
  mime_type: "image/png",
  width: 1,
  height: 1,
  source_url: null,
  note: null,
  capture_channel: "web",
  created_at: "2026-11-06T10:00:00.000Z",
};
const INTENT = {
  workspaceId: WORKSPACE,
  contentHash: "a".repeat(64),
  mimeType: "image/png" as const,
  byteSize: 10,
  width: 1,
  height: 1,
  sourceUrl: null,
  note: null,
  channel: "web" as const,
};

function clientReturning(data: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data, error }));
  return { rpc, client: { rpc } as unknown as SupabaseClient };
}

describe("createInspirationRepository (session actor)", () => {
  it("calls create_inspiration_intent with the exact SQL parameter names", async () => {
    const { rpc, client } = clientReturning({ item: ROW, duplicate: false });
    const result = await createInspirationRepository(client, { kind: "session" }).createIntent(INTENT);
    expect(rpc).toHaveBeenCalledWith("create_inspiration_intent", {
      target_workspace_id: WORKSPACE,
      item_hash: "a".repeat(64),
      item_mime: "image/png",
      item_size: 10,
      item_width: 1,
      item_height: 1,
      item_source_url: null,
      item_note: null,
      item_channel: "web",
    });
    expect(result.duplicate).toBe(false);
    expect(result.item.id).toBe(ITEM);
  });

  it("finalizes, fails, and links with session RPCs", async () => {
    const { rpc, client } = clientReturning(1);
    const repository = createInspirationRepository(client, { kind: "session" });
    await repository.finalize(ITEM);
    await repository.fail(ITEM);
    expect(await repository.linkToRoom(ROOM, [ITEM])).toBe(1);
    expect(rpc).toHaveBeenNthCalledWith(1, "finalize_inspiration_item", { target_item_id: ITEM });
    expect(rpc).toHaveBeenNthCalledWith(2, "fail_inspiration_item", { target_item_id: ITEM });
    expect(rpc).toHaveBeenNthCalledWith(3, "link_inspiration_to_room", { target_room_id: ROOM, target_item_ids: [ITEM] });
  });
});

describe("createInspirationRepository (capture actor)", () => {
  it("uses capture_ RPCs and passes the actor explicitly", async () => {
    const { rpc, client } = clientReturning({ item: ROW, duplicate: true });
    const repository = createInspirationRepository(client, { kind: "capture", userId: USER });
    await repository.createIntent(INTENT);
    await repository.finalize(ITEM);
    await repository.fail(ITEM);
    await repository.linkToRoom(ROOM, [ITEM]);
    expect(rpc).toHaveBeenNthCalledWith(1, "capture_inspiration_intent", expect.objectContaining({ actor_user_id: USER }));
    expect(rpc).toHaveBeenNthCalledWith(2, "capture_finalize_inspiration_item", { actor_user_id: USER, target_item_id: ITEM });
    expect(rpc).toHaveBeenNthCalledWith(3, "capture_fail_inspiration_item", { actor_user_id: USER, target_item_id: ITEM });
    expect(rpc).toHaveBeenNthCalledWith(4, "capture_link_inspiration_to_room", {
      actor_user_id: USER,
      target_room_id: ROOM,
      target_item_id: ITEM,
    });
  });

  it("refuses to link more than one item at a time for the shelf", async () => {
    const { client } = clientReturning(1);
    const repository = createInspirationRepository(client, { kind: "capture", userId: USER });
    await expect(repository.linkToRoom(ROOM, [ITEM, ITEM])).rejects.toThrow(InspirationRepositoryError);
  });
});

describe("errors", () => {
  it("wraps RPC errors with the Postgres message as the code", async () => {
    const { client } = clientReturning(null, { message: "not_authorized" });
    await expect(createInspirationRepository(client, { kind: "session" }).finalize(ITEM)).rejects.toMatchObject({
      code: "not_authorized",
    });
  });

  it("rejects a malformed intent payload", async () => {
    const { client } = clientReturning({ item: { id: "x" }, duplicate: false });
    await expect(createInspirationRepository(client, { kind: "session" }).createIntent(INTENT)).rejects.toMatchObject({
      code: "malformed_response",
    });
  });
});
```

`apps/web/src/features/inspiration/inspiration-storage.test.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createInspirationStorage } from "./inspiration-storage";

function storageClient(overrides: Record<string, unknown> = {}) {
  const bucket = {
    upload: vi.fn(async () => ({ error: null })),
    remove: vi.fn(async () => ({ error: null })),
    createSignedUrls: vi.fn(async () => ({
      data: [
        { path: "w/a.png", signedUrl: "https://signed/a", error: null },
        { path: "w/b.png", signedUrl: null, error: "missing" },
      ],
      error: null,
    })),
    ...overrides,
  };
  const from = vi.fn(() => bucket);
  return { bucket, from, client: { storage: { from } } as unknown as SupabaseClient };
}

describe("createInspirationStorage", () => {
  it("uploads with upsert so a retried intent can overwrite its own path", async () => {
    const { bucket, from, client } = storageClient();
    await createInspirationStorage(client).upload("w/a.png", new Uint8Array([1]), "image/png");
    expect(from).toHaveBeenCalledWith("inspiration");
    expect(bucket.upload).toHaveBeenCalledWith("w/a.png", new Uint8Array([1]), { contentType: "image/png", upsert: true });
  });

  it("throws when the upload fails", async () => {
    const { client } = storageClient({ upload: vi.fn(async () => ({ error: { message: "boom" } })) });
    await expect(createInspirationStorage(client).upload("w/a.png", new Uint8Array([1]), "image/png")).rejects.toThrow(
      "Inspiration upload failed",
    );
  });

  it("signs a batch and keeps only successful URLs", async () => {
    const { bucket, client } = storageClient();
    const urls = await createInspirationStorage(client).signUrls(["w/a.png", "w/b.png"]);
    expect(bucket.createSignedUrls).toHaveBeenCalledWith(["w/a.png", "w/b.png"], 3600);
    expect([...urls.entries()]).toEqual([["w/a.png", "https://signed/a"]]);
  });

  it("does not call storage for an empty batch", async () => {
    const { bucket, client } = storageClient();
    expect((await createInspirationStorage(client).signUrls([])).size).toBe(0);
    await createInspirationStorage(client).remove([]);
    expect(bucket.createSignedUrls).not.toHaveBeenCalled();
    expect(bucket.remove).not.toHaveBeenCalled();
  });
});
```

`apps/web/src/features/inspiration/save-inspiration-item.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { InspirationRepository } from "./inspiration-repository";
import type { InspirationStorage } from "./inspiration-storage";
import { saveInspirationItem } from "./save-inspiration-item";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ITEM = "11111111-1111-4111-8111-111111111111";
const ROOM = "33333333-3333-4333-8333-333333333333";

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function row(status: "pending" | "ready") {
  return {
    id: ITEM,
    workspace_id: WORKSPACE,
    status,
    storage_path: `${WORKSPACE}/${ITEM}.png`,
    mime_type: "image/png" as const,
    width: 2,
    height: 3,
    source_url: null,
    note: null,
    capture_channel: "web" as const,
    created_at: "2026-11-06T10:00:00.000Z",
  };
}

function deps(options: { duplicate?: boolean; uploadFails?: boolean; linkFails?: boolean } = {}) {
  const repository: InspirationRepository = {
    createIntent: vi.fn(async () => ({ item: row(options.duplicate ? "ready" : "pending"), duplicate: Boolean(options.duplicate) })),
    finalize: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    linkToRoom: vi.fn(async () => {
      if (options.linkFails) throw new Error("not_authorized");
      return 1;
    }),
  };
  const storage: InspirationStorage = {
    upload: vi.fn(async () => {
      if (options.uploadFails) throw new Error("Inspiration upload failed");
    }),
    remove: vi.fn(async () => undefined),
    signUrls: vi.fn(async () => new Map()),
  };
  return { repository, storage };
}

const INPUT = {
  workspaceId: WORKSPACE,
  bytes: pngHeader(2, 3),
  note: "nav",
  sourceUrl: null,
  roomId: null,
  channel: "web" as const,
};

describe("saveInspirationItem", () => {
  it("creates an intent from server-measured values, uploads, then finalizes", async () => {
    const d = deps();
    const result = await saveInspirationItem(INPUT, d);
    expect(result).toEqual({ ok: true, itemId: ITEM, duplicate: false, roomLinked: false });
    expect(d.repository.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE, mimeType: "image/png", width: 2, height: 3, note: "nav", channel: "web" }),
    );
    expect(d.storage.upload).toHaveBeenCalledWith(`${WORKSPACE}/${ITEM}.png`, INPUT.bytes, "image/png");
    expect(d.repository.finalize).toHaveBeenCalledWith(ITEM);
  });

  it("does not upload a duplicate", async () => {
    const d = deps({ duplicate: true });
    expect(await saveInspirationItem(INPUT, d)).toEqual({ ok: true, itemId: ITEM, duplicate: true, roomLinked: false });
    expect(d.storage.upload).not.toHaveBeenCalled();
    expect(d.repository.finalize).not.toHaveBeenCalled();
  });

  it("marks the item failed and reports unavailable when the upload fails", async () => {
    const d = deps({ uploadFails: true });
    expect(await saveInspirationItem(INPUT, d)).toEqual({ ok: false, error: "unavailable" });
    expect(d.repository.fail).toHaveBeenCalledWith(ITEM);
    expect(d.repository.finalize).not.toHaveBeenCalled();
  });

  it("links to the room after finalizing, also for duplicates", async () => {
    for (const duplicate of [false, true]) {
      const d = deps({ duplicate });
      expect(await saveInspirationItem({ ...INPUT, roomId: ROOM }, d)).toMatchObject({ ok: true, roomLinked: true });
      expect(d.repository.linkToRoom).toHaveBeenCalledWith(ROOM, [ITEM]);
    }
  });

  it("still saves the image when the room link fails", async () => {
    const d = deps({ linkFails: true });
    expect(await saveInspirationItem({ ...INPUT, roomId: ROOM }, d)).toEqual({
      ok: true,
      itemId: ITEM,
      duplicate: false,
      roomLinked: false,
    });
  });

  it("returns the validation error without touching the database", async () => {
    const d = deps();
    expect(await saveInspirationItem({ ...INPUT, bytes: new TextEncoder().encode("nope") }, d)).toEqual({
      ok: false,
      error: "unsupported_type",
    });
    expect(d.repository.createIntent).not.toHaveBeenCalled();
  });

  it("reports unavailable when the intent RPC throws", async () => {
    const d = deps();
    vi.mocked(d.repository.createIntent).mockRejectedValueOnce(new Error("boom"));
    expect(await saveInspirationItem(INPUT, d)).toEqual({ ok: false, error: "unavailable" });
  });
});
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `pnpm --filter @meld/web test -- features/inspiration`
Expected: FAIL, unresolved imports for every module.

- [ ] **Step 4: Implement**

`apps/web/src/features/inspiration/inspiration-shared.ts`:

```ts
import {
  CaptureChannelSchema,
  InspirationItemViewSchema,
  InspirationMimeTypeSchema,
  type InspirationItemView,
} from "@meld/contracts";
import { z } from "zod";

// Pure constants + the row -> view mapper, kept outside the "use server"
// modules (which may only export async functions) so readers, actions, and
// routes share one definition.
export const INSPIRATION_BUCKET = "inspiration";
export const SIGNED_URL_TTL_SECONDS = 60 * 60;
export const INSPIRATION_ITEM_COLUMNS =
  "id,workspace_id,status,storage_path,mime_type,width,height,source_url,note,capture_channel,created_at";

export const InspirationItemRowSchema = z
  .object({
    id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    status: z.enum(["pending", "ready", "failed"]),
    storage_path: z.string(),
    mime_type: InspirationMimeTypeSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    source_url: z.string().nullable(),
    note: z.string().nullable(),
    capture_channel: CaptureChannelSchema,
    created_at: z.string(),
  })
  .passthrough();
export type InspirationItemRow = z.infer<typeof InspirationItemRowSchema>;

export function toItemView(
  row: unknown,
  { imageUrl, roomIds }: { imageUrl: string | null; roomIds: string[] },
): InspirationItemView | null {
  const parsedRow = InspirationItemRowSchema.safeParse(row);
  if (!parsedRow.success) return null;
  const r = parsedRow.data;
  const parsed = InspirationItemViewSchema.safeParse({
    id: r.id,
    workspaceId: r.workspace_id,
    imageUrl,
    width: r.width,
    height: r.height,
    mimeType: r.mime_type,
    sourceUrl: r.source_url,
    note: r.note,
    captureChannel: r.capture_channel,
    createdAt: r.created_at,
    roomIds,
  });
  return parsed.success ? parsed.data : null;
}
```

`apps/web/src/features/inspiration/image-validation.ts`:

```ts
import "server-only";

import { createHash } from "node:crypto";
import { INSPIRATION_LIMITS, type InspirationMimeType } from "@meld/contracts";
import { imageSize } from "image-size";

export type ImageValidationError = "unsupported_type" | "too_large" | "invalid_image";
export type ValidatedImage = {
  mimeType: InspirationMimeType;
  width: number;
  height: number;
  byteSize: number;
  contentHash: string;
};
export type ImageValidationResult = { ok: true; image: ValidatedImage } | { ok: false; error: ImageValidationError };

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

// The client's Content-Type and file name are never trusted: the type comes
// from the bytes themselves.
export function sniffMimeType(bytes: Uint8Array): InspirationMimeType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function validateImageBytes(bytes: Uint8Array): ImageValidationResult {
  if (bytes.byteLength === 0) return { ok: false, error: "invalid_image" };
  if (bytes.byteLength > INSPIRATION_LIMITS.maxBytes) return { ok: false, error: "too_large" };

  const mimeType = sniffMimeType(bytes);
  if (!mimeType) return { ok: false, error: "unsupported_type" };

  let width: number | undefined;
  let height: number | undefined;
  try {
    ({ width, height } = imageSize(bytes));
  } catch {
    return { ok: false, error: "invalid_image" };
  }
  if (!width || !height) return { ok: false, error: "invalid_image" };
  if (Math.max(width, height) > INSPIRATION_LIMITS.maxEdge) return { ok: false, error: "too_large" };

  return {
    ok: true,
    image: {
      mimeType,
      width,
      height,
      byteSize: bytes.byteLength,
      contentHash: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}
```

`apps/web/src/features/inspiration/inspiration-repository.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CaptureChannel, InspirationMimeType } from "@meld/contracts";
import { z } from "zod";
import { InspirationItemRowSchema, type InspirationItemRow } from "./inspiration-shared";

// Who is acting. The browser path relies on auth.uid() inside the RPC; the
// shelf path uses the service-role client and names the user explicitly.
export type InspirationActor = { kind: "session" } | { kind: "capture"; userId: string };

export type IntentInput = {
  workspaceId: string;
  contentHash: string;
  mimeType: InspirationMimeType;
  byteSize: number;
  width: number;
  height: number;
  sourceUrl: string | null;
  note: string | null;
  channel: CaptureChannel;
};

export interface InspirationRepository {
  createIntent(input: IntentInput): Promise<{ item: InspirationItemRow; duplicate: boolean }>;
  finalize(itemId: string): Promise<void>;
  fail(itemId: string): Promise<void>;
  linkToRoom(roomId: string, itemIds: string[]): Promise<number>;
}

export class InspirationRepositoryError extends Error {
  constructor(readonly code: string) {
    super(`Inspiration RPC failed: ${code}`);
    this.name = "InspirationRepositoryError";
  }
}

const IntentResultSchema = z.object({ item: InspirationItemRowSchema, duplicate: z.boolean() });

export function createInspirationRepository(
  client: SupabaseClient,
  actor: InspirationActor,
): InspirationRepository {
  const actorArgs = actor.kind === "capture" ? { actor_user_id: actor.userId } : {};
  const prefix = actor.kind === "capture" ? "capture_" : "";

  async function call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new InspirationRepositoryError(error.message);
    return data;
  }

  return {
    async createIntent(input) {
      const data = await call(actor.kind === "capture" ? "capture_inspiration_intent" : "create_inspiration_intent", {
        ...actorArgs,
        target_workspace_id: input.workspaceId,
        item_hash: input.contentHash,
        item_mime: input.mimeType,
        item_size: input.byteSize,
        item_width: input.width,
        item_height: input.height,
        item_source_url: input.sourceUrl,
        item_note: input.note,
        item_channel: input.channel,
      });
      const parsed = IntentResultSchema.safeParse(data);
      if (!parsed.success) throw new InspirationRepositoryError("malformed_response");
      return parsed.data;
    },
    async finalize(itemId) {
      await call(`${prefix}finalize_inspiration_item`, { ...actorArgs, target_item_id: itemId });
    },
    async fail(itemId) {
      await call(`${prefix}fail_inspiration_item`, { ...actorArgs, target_item_id: itemId });
    },
    async linkToRoom(roomId, itemIds) {
      if (actor.kind === "capture") {
        // The shelf only ever saves one image per request.
        if (itemIds.length !== 1) throw new InspirationRepositoryError("invalid_request");
        return Number(
          await call("capture_link_inspiration_to_room", {
            actor_user_id: actor.userId,
            target_room_id: roomId,
            target_item_id: itemIds[0],
          }),
        );
      }
      return Number(await call("link_inspiration_to_room", { target_room_id: roomId, target_item_ids: itemIds }));
    },
  };
}
```

`apps/web/src/features/inspiration/inspiration-storage.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { INSPIRATION_BUCKET, SIGNED_URL_TTL_SECONDS } from "./inspiration-shared";

export interface InspirationStorage {
  upload(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  signUrls(paths: string[]): Promise<Map<string, string>>;
}

export function createInspirationStorage(client: SupabaseClient): InspirationStorage {
  const bucket = () => client.storage.from(INSPIRATION_BUCKET);
  return {
    async upload(path, bytes, contentType) {
      // upsert: a retried intent reuses its row and path (see inspiration_intent_for).
      const { error } = await bucket().upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error("Inspiration upload failed");
    },
    async remove(paths) {
      if (paths.length === 0) return;
      const { error } = await bucket().remove(paths);
      if (error) throw new Error("Inspiration removal failed");
    },
    async signUrls(paths) {
      const urls = new Map<string, string>();
      if (paths.length === 0) return urls;
      const { data } = await bucket().createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
      }
      return urls;
    },
  };
}
```

`apps/web/src/features/inspiration/save-inspiration-item.ts`:

```ts
import type { CaptureChannel } from "@meld/contracts";
import { validateImageBytes, type ImageValidationError } from "./image-validation";
import type { InspirationRepository } from "./inspiration-repository";
import type { InspirationStorage } from "./inspiration-storage";

export type SaveInspirationInput = {
  workspaceId: string;
  bytes: Uint8Array;
  note: string | null;
  sourceUrl: string | null;
  roomId: string | null;
  channel: CaptureChannel;
};

export type SaveInspirationResult =
  | { ok: true; itemId: string; duplicate: boolean; roomLinked: boolean }
  | { ok: false; error: ImageValidationError | "unavailable" };

// The ONE write path for inspiration images (spec Part C). Shelf uploads and
// web uploads differ only in which repository/storage they pass in.
export async function saveInspirationItem(
  input: SaveInspirationInput,
  { repository, storage }: { repository: InspirationRepository; storage: InspirationStorage },
): Promise<SaveInspirationResult> {
  const validated = validateImageBytes(input.bytes);
  if (!validated.ok) return { ok: false, error: validated.error };
  const image = validated.image;

  let intent: Awaited<ReturnType<InspirationRepository["createIntent"]>>;
  try {
    intent = await repository.createIntent({
      workspaceId: input.workspaceId,
      contentHash: image.contentHash,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
      sourceUrl: input.sourceUrl,
      note: input.note,
      channel: input.channel,
    });
  } catch (error) {
    console.error("inspiration intent failed", { code: errorCode(error) });
    return { ok: false, error: "unavailable" };
  }

  const itemId = intent.item.id;
  if (!intent.duplicate) {
    try {
      await storage.upload(intent.item.storage_path, input.bytes, image.mimeType);
      await repository.finalize(itemId);
    } catch (error) {
      console.error("inspiration upload failed", { code: errorCode(error) });
      await repository.fail(itemId).catch(() => undefined);
      return { ok: false, error: "unavailable" };
    }
  }

  let roomLinked = false;
  if (input.roomId) {
    try {
      await repository.linkToRoom(input.roomId, [itemId]);
      roomLinked = true;
    } catch (error) {
      // A room problem never fails the save (spec E3).
      console.error("inspiration room link failed", { code: errorCode(error) });
    }
  }

  return { ok: true, itemId, duplicate: intent.duplicate, roomLinked };
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String(error.code) : "unknown";
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `pnpm --filter @meld/web test -- features/inspiration && pnpm --filter @meld/web typecheck`
Expected: all PASS; typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/features/inspiration
git commit -m "feat(inspiration): single save path with server-side image validation"
```

---
### Task 6: ShelfCore networking, Keychain, and uploader

**Load the `swiftui-pro` skill first** (`swift.md`, `hygiene.md`).

**Files (all under `apps/shelf/`):**
- Create: `Sources/ShelfCore/Network/OrionClient.swift`, `ShelfUpload.swift`, `ShelfConnectRequest.swift`, `ShelfConnectResponse.swift`, `ShelfRoom.swift`, `ShelfUploadResponse.swift`, `ShelfAPIError.swift`, `ShelfErrorBody.swift`, `ShelfErrorEnvelope.swift`, `MultipartFormBody.swift`, `URLSessionOrionClient.swift`
- Create: `Sources/ShelfCore/Auth/TokenStore.swift`, `TokenStoreError.swift`, `KeychainTokenStore.swift`
- Create: `Sources/ShelfCore/Upload/BackoffSchedule.swift`, `UploadedItem.swift`, `DrainReport.swift`, `Uploader.swift`
- Create: `Sources/ShelfCore/State/ConnectionState.swift`
- Create test support: `Tests/ShelfTestSupport/FakeOrionClient.swift`, `Tests/ShelfTestSupport/InMemoryTokenStore.swift`
- Create tests: `Tests/ShelfCoreTests/StubURLProtocol.swift`, `MultipartFormBodyTests.swift`, `URLSessionOrionClientTests.swift`, `BackoffScheduleTests.swift`, `UploaderTests.swift`, `KeychainTokenStoreTests.swift`

**Interfaces:**
- Consumes (Task 4): `Outbox`, `OutboxEntry`, `ImageMimeType`, `Limits`.
- Produces:
  - `public protocol OrionClient: Sendable { func connect(code: String, deviceName: String) async throws(ShelfAPIError) -> ShelfConnectResponse; func rooms(token: String) async throws(ShelfAPIError) -> [ShelfRoom]; func upload(_ upload: ShelfUpload, token: String) async throws(ShelfAPIError) -> ShelfUploadResponse }`
  - `public struct URLSessionOrionClient: OrionClient { init(baseURL: URL, session: URLSession = .shared) }`
  - `public struct ShelfUpload: Sendable, Equatable { data; mimeType; note; sourceURL; roomID; init(entry: OutboxEntry, data: Data) }`
  - `public struct ShelfRoom: Codable, Sendable, Hashable, Identifiable { roomId: UUID; roomName: String; projectName: String; id }`
  - `public struct ShelfUploadResponse: Codable, Sendable, Equatable { itemId: UUID; duplicate: Bool; roomLinked: Bool }`
  - `public struct ShelfConnectResponse: Codable, Sendable, Equatable { token: String; workspaceId: UUID; workspaceName: String }`
  - `public struct ShelfAPIError: Error, Equatable, Sendable { code: Code; message: String }` with `Code` cases `unauthorized, invalidCode, rateLimited, unsupportedType, tooLarge, invalidImage, unavailable, network, unreadable`, and statics `.network`, `.unreadable`
  - `public protocol TokenStore: Sendable { func token() throws -> String?; func save(_: String) throws; func delete() throws }`, `public struct KeychainTokenStore: TokenStore { init(service: String = "com.orion.shelf", account: String) }`
  - `public struct BackoffSchedule: Sendable { init(base: Duration = .seconds(2), cap: Duration = .seconds(300)); func delay(afterFailures: Int) -> Duration }`
  - `public struct UploadedItem: Sendable, Equatable { entryID: UUID; response: ShelfUploadResponse }`
  - `public struct DrainReport: Sendable, Equatable { uploaded: [UploadedItem]; rejected: [ShelfAPIError]; isUnauthorized: Bool; retryAfter: Duration?; remaining: Int }`
  - `public actor Uploader { init(outbox: Outbox, client: any OrionClient, tokenStore: any TokenStore, schedule: BackoffSchedule = .init()); func drain() async -> DrainReport }` (to change server, build a new `Uploader`)
  - `public enum ConnectionState: Equatable, Sendable { case disconnected; case connected(workspaceID: UUID, workspaceName: String) }`

- [ ] **Step 1: Write the test doubles**

`Tests/ShelfCoreTests/StubURLProtocol.swift`:

```swift
import Foundation
import Synchronization

/// Serves canned responses per host, so parallel tests never share a handler.
final class StubURLProtocol: URLProtocol {
    typealias Handler = @Sendable (URLRequest) throws -> (Int, Data)

    private static let handlers = Mutex<[String: Handler]>([:])

    static func register(host: String, handler: @escaping Handler) {
        handlers.withLock { $0[host] = handler }
    }

    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    /// URLSession moves `httpBody` into a stream before a protocol sees it.
    static func body(of request: URLRequest) -> Data {
        guard let stream = request.httpBodyStream else { return request.httpBody ?? Data() }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard
            let url = request.url,
            let host = url.host(),
            let handler = Self.handlers.withLock({ $0[host] })
        else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
            return
        }
        do {
            let (status, data) = try handler(request)
            let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)
            if let response {
                client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            }
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
```

`Tests/ShelfTestSupport/FakeOrionClient.swift`:

```swift
import Foundation
import ShelfCore

/// Plays back scripted results and records what it was sent.
public actor FakeOrionClient: OrionClient {
    private var uploadResults: [Result<ShelfUploadResponse, ShelfAPIError>]
    private let connectResult: Result<ShelfConnectResponse, ShelfAPIError>
    private let roomsResult: Result<[ShelfRoom], ShelfAPIError>
    public private(set) var uploads: [ShelfUpload] = []
    public private(set) var tokensSeen: [String] = []

    public init(
        uploadResults: [Result<ShelfUploadResponse, ShelfAPIError>] = [],
        connectResult: Result<ShelfConnectResponse, ShelfAPIError> = .success(
            ShelfConnectResponse(token: "orion_cap_test", workspaceId: UUID(), workspaceName: "Test")
        ),
        roomsResult: Result<[ShelfRoom], ShelfAPIError> = .success([])
    ) {
        self.uploadResults = uploadResults
        self.connectResult = connectResult
        self.roomsResult = roomsResult
    }

    public func connect(code: String, deviceName: String) async throws(ShelfAPIError) -> ShelfConnectResponse {
        try connectResult.get()
    }

    public func rooms(token: String) async throws(ShelfAPIError) -> [ShelfRoom] {
        try roomsResult.get()
    }

    public func upload(_ upload: ShelfUpload, token: String) async throws(ShelfAPIError) -> ShelfUploadResponse {
        uploads.append(upload)
        tokensSeen.append(token)
        guard !uploadResults.isEmpty else { throw ShelfAPIError.network }
        return try uploadResults.removeFirst().get()
    }
}
```

`Tests/ShelfTestSupport/InMemoryTokenStore.swift`:

```swift
import ShelfCore
import Synchronization

public final class InMemoryTokenStore: TokenStore {
    private let stored: Mutex<String?>

    public init(token: String?) {
        stored = Mutex(token)
    }

    public func token() throws -> String? { stored.withLock { $0 } }
    public func save(_ token: String) throws { stored.withLock { $0 = token } }
    public func delete() throws { stored.withLock { $0 = nil } }
}
```

- [ ] **Step 2: Write the failing tests**

`Tests/ShelfCoreTests/MultipartFormBodyTests.swift`:

```swift
import Foundation
import Testing
@testable import ShelfCore

struct MultipartFormBodyTests {
    @Test func encodesFieldsAndAFileBetweenBoundaries() throws {
        var body = MultipartFormBody(boundary: "B")
        body.addField(name: "note", value: "love this")
        body.addFile(name: "file", fileName: "image.png", mimeType: "image/png", data: Data([0x89, 0x50]))
        let text = try #require(String(data: body.finalized(), encoding: .isoLatin1))

        #expect(body.contentType == "multipart/form-data; boundary=B")
        #expect(text.contains("--B\r\nContent-Disposition: form-data; name=\"note\"\r\n\r\nlove this\r\n"))
        #expect(text.contains("--B\r\nContent-Disposition: form-data; name=\"file\"; filename=\"image.png\"\r\nContent-Type: image/png\r\n\r\n"))
        #expect(text.hasSuffix("\r\n--B--\r\n"))
    }
}
```

`Tests/ShelfCoreTests/URLSessionOrionClientTests.swift`:

```swift
import Foundation
import Testing
@testable import ShelfCore

struct URLSessionOrionClientTests {
    let host = "orion-\(UUID().uuidString.lowercased()).test"
    var baseURL: URL { URL(string: "http://\(host)")! }

    private func client() -> URLSessionOrionClient {
        URLSessionOrionClient(baseURL: baseURL, session: StubURLProtocol.session())
    }

    @Test func connectPostsJSONAndDecodesTheToken() async throws {
        let workspaceID = UUID()
        StubURLProtocol.register(host: host) { request in
            #expect(request.url?.path() == "/api/shelf/connect")
            #expect(request.httpMethod == "POST")
            let body = try JSONDecoder().decode([String: String].self, from: StubURLProtocol.body(of: request))
            #expect(body == ["code": "ABCD1234", "deviceName": "Studio Mac"])
            let json = #"{"token":"orion_cap_x","workspaceId":"\#(workspaceID.uuidString.lowercased())","workspaceName":"Mine"}"#
            return (201, Data(json.utf8))
        }

        let response = try await client().connect(code: "ABCD1234", deviceName: "Studio Mac")

        #expect(response == ShelfConnectResponse(token: "orion_cap_x", workspaceId: workspaceID, workspaceName: "Mine"))
    }

    @Test func mapsTheServerErrorEnvelope() async {
        StubURLProtocol.register(host: host) { _ in
            (400, Data(#"{"error":{"code":"invalid_code","message":"That code didn't work."}}"#.utf8))
        }
        await #expect(throws: ShelfAPIError(code: .invalidCode, message: "That code didn't work.")) {
            try await client().connect(code: "X", deviceName: "Mac")
        }
    }

    @Test func roomsSendsTheBearerToken() async throws {
        let roomID = UUID()
        StubURLProtocol.register(host: host) { request in
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer orion_cap_t")
            let json = #"[{"roomId":"\#(roomID.uuidString.lowercased())","roomName":"Login","projectName":"App"}]"#
            return (200, Data(json.utf8))
        }
        #expect(try await client().rooms(token: "orion_cap_t") == [ShelfRoom(roomId: roomID, roomName: "Login", projectName: "App")])
    }

    @Test func uploadSendsMultipartWithLowercasedRoomID() async throws {
        let roomID = UUID()
        let itemID = UUID()
        StubURLProtocol.register(host: host) { request in
            #expect(request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
            let body = String(decoding: StubURLProtocol.body(of: request), as: UTF8.self)
            #expect(body.contains("name=\"roomId\"\r\n\r\n\(roomID.uuidString.lowercased())\r\n"))
            #expect(body.contains("name=\"note\"\r\n\r\nnice\r\n"))
            #expect(body.contains("filename=\"image.jpg\""))
            return (201, Data(#"{"itemId":"\#(itemID.uuidString.lowercased())","duplicate":false,"roomLinked":true}"#.utf8))
        }
        let upload = ShelfUpload(data: Data([1]), mimeType: .jpeg, note: "nice", sourceURL: nil, roomID: roomID)

        let response = try await client().upload(upload, token: "orion_cap_t")

        #expect(response == ShelfUploadResponse(itemId: itemID, duplicate: false, roomLinked: true))
    }

    @Test(arguments: [
        (401, ShelfAPIError.Code.unauthorized),
        (413, .tooLarge),
        (415, .unsupportedType),
        (422, .invalidImage),
        (429, .rateLimited),
        (500, .unavailable),
    ])
    func fallsBackToTheStatusCodeWhenTheBodyIsNotJSON(status: Int, expected: ShelfAPIError.Code) async {
        StubURLProtocol.register(host: host) { _ in (status, Data("oops".utf8)) }
        do {
            _ = try await client().rooms(token: "orion_cap_t")
            Issue.record("expected an error")
        } catch {
            #expect(error.code == expected)
        }
    }

    @Test func unreachableServerIsANetworkError() async {
        let unreachable = URLSessionOrionClient(baseURL: URL(string: "http://nobody-registered.test")!, session: StubURLProtocol.session())
        await #expect(throws: ShelfAPIError.network) {
            try await unreachable.rooms(token: "t")
        }
    }
}
```

`Tests/ShelfCoreTests/BackoffScheduleTests.swift`:

```swift
import Testing
@testable import ShelfCore

struct BackoffScheduleTests {
    @Test func doublesFromTwoSecondsAndCapsAtFiveMinutes() {
        let schedule = BackoffSchedule()
        #expect(schedule.delay(afterFailures: 0) == .zero)
        #expect(schedule.delay(afterFailures: 1) == .seconds(2))
        #expect(schedule.delay(afterFailures: 2) == .seconds(4))
        #expect(schedule.delay(afterFailures: 3) == .seconds(8))
        #expect(schedule.delay(afterFailures: 9) == .seconds(300))
        #expect(schedule.delay(afterFailures: 500) == .seconds(300))
    }
}
```

`Tests/ShelfCoreTests/UploaderTests.swift`:

```swift
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct UploaderTests {
    let outbox = Outbox(directory: URL.temporaryDirectory.appending(path: "uploader-\(UUID().uuidString)", directoryHint: .isDirectory))
    let image = NormalizedImage(data: Data([1]), mimeType: .png, width: 1, height: 1)

    private func ok() -> Result<ShelfUploadResponse, ShelfAPIError> {
        .success(ShelfUploadResponse(itemId: UUID(), duplicate: false, roomLinked: false))
    }

    private func enqueue(_ count: Int) async throws -> [OutboxEntry] {
        var entries: [OutboxEntry] = []
        for index in 0..<count {
            entries.append(try await outbox.enqueue(image, note: nil, sourceURL: nil, roomID: nil, now: Date(timeIntervalSince1970: Double(index))))
        }
        return entries
    }

    @Test func uploadsEverythingAndEmptiesTheOutbox() async throws {
        let entries = try await enqueue(2)
        let client = FakeOrionClient(uploadResults: [ok(), ok()])
        let uploader = Uploader(outbox: outbox, client: client, tokenStore: InMemoryTokenStore(token: "orion_cap_t"))

        let report = await uploader.drain()

        #expect(report.uploaded.map(\.entryID) == entries.map(\.id))
        #expect(report.remaining == 0)
        #expect(report.retryAfter == nil)
        #expect(await client.tokensSeen == ["orion_cap_t", "orion_cap_t"])
    }

    @Test func rejectsWhatTheServerWillNeverAcceptAndKeepsGoing() async throws {
        _ = try await enqueue(2)
        let tooLarge = ShelfAPIError(code: .tooLarge, message: "Too large to save.")
        let uploader = Uploader(outbox: outbox, client: FakeOrionClient(uploadResults: [.failure(tooLarge), ok()]), tokenStore: InMemoryTokenStore(token: "t"))

        let report = await uploader.drain()

        #expect(report.rejected == [tooLarge])
        #expect(report.uploaded.count == 1)
        #expect(report.remaining == 0)
    }

    @Test func stopsAndKeepsEverythingWhenUnauthorized() async throws {
        _ = try await enqueue(2)
        let unauthorized = ShelfAPIError(code: .unauthorized, message: "Reconnect")
        let uploader = Uploader(outbox: outbox, client: FakeOrionClient(uploadResults: [.failure(unauthorized)]), tokenStore: InMemoryTokenStore(token: "t"))

        let report = await uploader.drain()

        #expect(report.isUnauthorized)
        #expect(report.remaining == 2)
    }

    @Test func withoutATokenNothingIsSent() async throws {
        _ = try await enqueue(1)
        let client = FakeOrionClient(uploadResults: [ok()])
        let report = await Uploader(outbox: outbox, client: client, tokenStore: InMemoryTokenStore(token: nil)).drain()

        #expect(report.isUnauthorized)
        #expect(report.remaining == 1)
        #expect(await client.uploads.isEmpty)
    }

    @Test func backsOffOnServerTroubleAndResetsAfterSuccess() async throws {
        _ = try await enqueue(1)
        let unavailable = ShelfAPIError(code: .unavailable, message: "later")
        let uploader = Uploader(
            outbox: outbox,
            client: FakeOrionClient(uploadResults: [.failure(unavailable), .failure(.network), ok()]),
            tokenStore: InMemoryTokenStore(token: "t")
        )

        #expect(await uploader.drain().retryAfter == .seconds(2))
        #expect(await uploader.drain().retryAfter == .seconds(4))
        let final = await uploader.drain()
        #expect(final.retryAfter == nil)
        #expect(final.remaining == 0)
    }
}
```

`Tests/ShelfCoreTests/KeychainTokenStoreTests.swift`:

```swift
import Foundation
import Testing
@testable import ShelfCore

struct KeychainTokenStoreTests {
    @Test func savesReadsReplacesAndDeletes() throws {
        let store = KeychainTokenStore(service: "com.orion.shelf.tests.\(UUID().uuidString)", account: "http://127.0.0.1:3000")
        defer { try? store.delete() }

        #expect(try store.token() == nil)
        try store.save("orion_cap_one")
        #expect(try store.token() == "orion_cap_one")
        try store.save("orion_cap_two")
        #expect(try store.token() == "orion_cap_two")
        try store.delete()
        #expect(try store.token() == nil)
    }
}
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `cd apps/shelf && swift test 2>&1 | tail -5`
Expected: build FAILS with `cannot find type 'OrionClient' in scope`.

- [ ] **Step 4: Implement**

`Sources/ShelfCore/Network/OrionClient.swift`:

```swift
/// Everything the shelf asks of Orion. Behind a protocol so models and the
/// uploader are tested without a network.
public protocol OrionClient: Sendable {
    func connect(code: String, deviceName: String) async throws(ShelfAPIError) -> ShelfConnectResponse
    func rooms(token: String) async throws(ShelfAPIError) -> [ShelfRoom]
    func upload(_ upload: ShelfUpload, token: String) async throws(ShelfAPIError) -> ShelfUploadResponse
}
```

`Sources/ShelfCore/Network/ShelfUpload.swift`:

```swift
import Foundation

public struct ShelfUpload: Sendable, Equatable {
    public let data: Data
    public let mimeType: ImageMimeType
    public let note: String?
    public let sourceURL: URL?
    public let roomID: UUID?

    public init(data: Data, mimeType: ImageMimeType, note: String?, sourceURL: URL?, roomID: UUID?) {
        self.data = data
        self.mimeType = mimeType
        self.note = note
        self.sourceURL = sourceURL
        self.roomID = roomID
    }

    public init(entry: OutboxEntry, data: Data) {
        self.init(data: data, mimeType: entry.mimeType, note: entry.note, sourceURL: entry.sourceURL, roomID: entry.roomID)
    }
}
```

`Sources/ShelfCore/Network/ShelfConnectRequest.swift`:

```swift
struct ShelfConnectRequest: Encodable {
    let code: String
    let deviceName: String
}
```

`Sources/ShelfCore/Network/ShelfConnectResponse.swift`:

```swift
import Foundation

public struct ShelfConnectResponse: Codable, Sendable, Equatable {
    public let token: String
    public let workspaceId: UUID
    public let workspaceName: String

    public init(token: String, workspaceId: UUID, workspaceName: String) {
        self.token = token
        self.workspaceId = workspaceId
        self.workspaceName = workspaceName
    }
}
```

`Sources/ShelfCore/Network/ShelfRoom.swift`:

```swift
import Foundation

/// A room the shelf may add images to. Names only: the shelf's key cannot read room content.
public struct ShelfRoom: Codable, Sendable, Hashable, Identifiable {
    public let roomId: UUID
    public let roomName: String
    public let projectName: String

    public var id: UUID { roomId }

    public init(roomId: UUID, roomName: String, projectName: String) {
        self.roomId = roomId
        self.roomName = roomName
        self.projectName = projectName
    }
}
```

`Sources/ShelfCore/Network/ShelfUploadResponse.swift`:

```swift
import Foundation

public struct ShelfUploadResponse: Codable, Sendable, Equatable {
    public let itemId: UUID
    public let duplicate: Bool
    public let roomLinked: Bool

    public init(itemId: UUID, duplicate: Bool, roomLinked: Bool) {
        self.itemId = itemId
        self.duplicate = duplicate
        self.roomLinked = roomLinked
    }
}
```

`Sources/ShelfCore/Network/ShelfAPIError.swift`:

```swift
import Foundation

/// A failure the owner may see. `message` is already human-readable: it comes
/// from Orion (spec E1 messages) or from the local cases below.
public struct ShelfAPIError: Error, Equatable, Sendable {
    public enum Code: String, Sendable {
        case unauthorized
        case invalidCode = "invalid_code"
        case rateLimited = "rate_limited"
        case unsupportedType = "unsupported_type"
        case tooLarge = "too_large"
        case invalidImage = "invalid_image"
        case unavailable
        /// Orion could not be reached at all.
        case network
        /// The waiting image could not be read back from the outbox.
        case unreadable
    }

    public static let network = ShelfAPIError(code: .network, message: String(localized: "Can't reach Orion. Is it running?"))
    public static let unreadable = ShelfAPIError(code: .unreadable, message: String(localized: "A waiting image could not be read and was set aside."))

    public let code: Code
    public let message: String

    public init(code: Code, message: String) {
        self.code = code
        self.message = message
    }
}
```

`Sources/ShelfCore/Network/ShelfErrorBody.swift`:

```swift
struct ShelfErrorBody: Decodable {
    let code: String
    let message: String
}
```

`Sources/ShelfCore/Network/ShelfErrorEnvelope.swift`:

```swift
/// The `{ "error": { "code", "message" } }` body every shelf route returns on failure.
struct ShelfErrorEnvelope: Decodable {
    let error: ShelfErrorBody
}
```

`Sources/ShelfCore/Network/MultipartFormBody.swift`:

```swift
import Foundation

public struct MultipartFormBody: Sendable {
    public let boundary: String
    private var body = Data()

    public init(boundary: String = "OrionShelf-\(UUID().uuidString)") {
        self.boundary = boundary
    }

    public var contentType: String { "multipart/form-data; boundary=\(boundary)" }

    public mutating func addField(name: String, value: String) {
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
    }

    public mutating func addFile(name: String, fileName: String, mimeType: String, data: Data) {
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"; filename=\"\(fileName)\"\r\nContent-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(data)
        body.append(Data("\r\n".utf8))
    }

    public func finalized() -> Data {
        body + Data("--\(boundary)--\r\n".utf8)
    }
}
```

`Sources/ShelfCore/Network/URLSessionOrionClient.swift`:

```swift
import Foundation

public struct URLSessionOrionClient: OrionClient {
    private let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func connect(code: String, deviceName: String) async throws(ShelfAPIError) -> ShelfConnectResponse {
        var request = URLRequest(url: baseURL.appending(path: "api/shelf/connect"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONEncoder().encode(ShelfConnectRequest(code: code, deviceName: deviceName))
        } catch {
            throw ShelfAPIError(code: .unavailable, message: String(localized: "Couldn't prepare the request."))
        }
        return try await send(request)
    }

    public func rooms(token: String) async throws(ShelfAPIError) -> [ShelfRoom] {
        var request = URLRequest(url: baseURL.appending(path: "api/shelf/rooms"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await send(request)
    }

    public func upload(_ upload: ShelfUpload, token: String) async throws(ShelfAPIError) -> ShelfUploadResponse {
        var form = MultipartFormBody()
        form.addFile(name: "file", fileName: "image.\(upload.mimeType.fileExtension)", mimeType: upload.mimeType.rawValue, data: upload.data)
        if let note = upload.note { form.addField(name: "note", value: note) }
        if let sourceURL = upload.sourceURL { form.addField(name: "sourceUrl", value: sourceURL.absoluteString) }
        // Lowercase to match the UUIDs Orion sends and validates.
        if let roomID = upload.roomID { form.addField(name: "roomId", value: roomID.uuidString.lowercased()) }

        var request = URLRequest(url: baseURL.appending(path: "api/shelf/items"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = form.finalized()
        return try await send(request)
    }

    private func send<Response: Decodable>(_ request: URLRequest) async throws(ShelfAPIError) -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw .network
        }
        guard let http = response as? HTTPURLResponse else { throw .network }
        guard (200..<300).contains(http.statusCode) else {
            throw Self.error(from: data, status: http.statusCode)
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw ShelfAPIError(code: .unavailable, message: String(localized: "Orion sent a response the shelf didn't understand."))
        }
    }

    private static func error(from data: Data, status: Int) -> ShelfAPIError {
        if let envelope = try? JSONDecoder().decode(ShelfErrorEnvelope.self, from: data),
           let code = ShelfAPIError.Code(rawValue: envelope.error.code) {
            return ShelfAPIError(code: code, message: envelope.error.message)
        }
        let code: ShelfAPIError.Code = switch status {
        case 401: .unauthorized
        case 413: .tooLarge
        case 415: .unsupportedType
        case 422: .invalidImage
        case 429: .rateLimited
        default: .unavailable
        }
        return ShelfAPIError(code: code, message: String(localized: "Orion couldn't save that right now. It will try again."))
    }
}
```

`Sources/ShelfCore/Auth/TokenStore.swift`:

```swift
/// Where the capture token lives. Only `KeychainTokenStore` is used in the app.
public protocol TokenStore: Sendable {
    func token() throws -> String?
    func save(_ token: String) throws
    func delete() throws
}
```

`Sources/ShelfCore/Auth/TokenStoreError.swift`:

```swift
import Security

public enum TokenStoreError: Error, Equatable, Sendable {
    case keychain(OSStatus)
}
```

`Sources/ShelfCore/Auth/KeychainTokenStore.swift`:

```swift
import Foundation
import Security

/// Stores the capture token as a generic password. `account` is the Orion base
/// URL, so a token minted by one Orion is never sent to another.
public struct KeychainTokenStore: TokenStore {
    private let service: String
    private let account: String

    public init(service: String = "com.orion.shelf", account: String) {
        self.service = service
        self.account = account
    }

    private var query: [CFString: Any] {
        [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
    }

    public func token() throws -> String? {
        var lookup = query
        lookup[kSecReturnData] = true
        lookup[kSecMatchLimit] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw TokenStoreError.keychain(status) }
        return String(data: data, encoding: .utf8)
    }

    public func save(_ token: String) throws {
        let data = Data(token.utf8)
        let updateStatus = SecItemUpdate(query as CFDictionary, [kSecValueData: data] as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else { throw TokenStoreError.keychain(updateStatus) }
        var item = query
        item[kSecValueData] = data
        item[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw TokenStoreError.keychain(addStatus) }
    }

    public func delete() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw TokenStoreError.keychain(status) }
    }
}
```

`Sources/ShelfCore/Upload/BackoffSchedule.swift`:

```swift
/// Wait times between retries when Orion is unreachable: 2s, 4s, 8s… capped at 5 minutes.
public struct BackoffSchedule: Sendable {
    private static let maxExponent = 16

    public let base: Duration
    public let cap: Duration

    public init(base: Duration = .seconds(2), cap: Duration = .seconds(300)) {
        self.base = base
        self.cap = cap
    }

    public func delay(afterFailures failures: Int) -> Duration {
        guard failures > 0 else { return .zero }
        let exponent = min(failures - 1, Self.maxExponent)
        return min(base * (1 << exponent), cap)
    }
}
```

`Sources/ShelfCore/Upload/UploadedItem.swift`:

```swift
import Foundation

public struct UploadedItem: Sendable, Equatable {
    public let entryID: UUID
    public let response: ShelfUploadResponse
}
```

`Sources/ShelfCore/Upload/DrainReport.swift`:

```swift
/// What one pass over the outbox achieved, for the app to show and schedule from.
public struct DrainReport: Sendable, Equatable {
    public var uploaded: [UploadedItem] = []
    public var rejected: [ShelfAPIError] = []
    public var isUnauthorized = false
    /// Set when Orion was unreachable or unavailable; try again after this long.
    public var retryAfter: Duration?
    public var remaining = 0

    public init() {}
}
```

`Sources/ShelfCore/Upload/Uploader.swift`:

```swift
import Foundation

/// Sends outbox entries one at a time, oldest first. Files are deleted only
/// after Orion confirms; rejected entries are set aside; a 401 stops
/// everything and keeps the queue for after reconnecting.
public actor Uploader {
    private let outbox: Outbox
    private let tokenStore: any TokenStore
    private let schedule: BackoffSchedule
    private let client: any OrionClient
    private var consecutiveFailures = 0

    public init(outbox: Outbox, client: any OrionClient, tokenStore: any TokenStore, schedule: BackoffSchedule = .init()) {
        self.outbox = outbox
        self.client = client
        self.tokenStore = tokenStore
        self.schedule = schedule
    }

    public func drain() async -> DrainReport {
        var report = DrainReport()
        guard let token = try? tokenStore.token() else {
            report.isUnauthorized = true
            report.remaining = await pendingCount()
            return report
        }

        let entries = (try? await outbox.pending()) ?? []
        entryLoop: for entry in entries {
            guard let data = try? await outbox.imageData(for: entry) else {
                try? await outbox.reject(entry)
                report.rejected.append(.unreadable)
                continue
            }
            do {
                let response = try await client.upload(ShelfUpload(entry: entry, data: data), token: token)
                // If removal fails the entry is re-sent later; Orion dedupes by content hash.
                try? await outbox.remove(entry)
                consecutiveFailures = 0
                report.uploaded.append(UploadedItem(entryID: entry.id, response: response))
            } catch {
                switch error.code {
                case .unauthorized:
                    report.isUnauthorized = true
                    break entryLoop
                case .unsupportedType, .tooLarge, .invalidImage, .unreadable:
                    try? await outbox.reject(entry)
                    report.rejected.append(error)
                case .invalidCode, .rateLimited, .unavailable, .network:
                    consecutiveFailures += 1
                    report.retryAfter = schedule.delay(afterFailures: consecutiveFailures)
                    break entryLoop
                }
            }
        }
        report.remaining = await pendingCount()
        return report
    }

    private func pendingCount() async -> Int {
        ((try? await outbox.pending()) ?? []).count
    }
}
```

`Sources/ShelfCore/State/ConnectionState.swift`:

```swift
import Foundation

public enum ConnectionState: Equatable, Sendable {
    case disconnected
    case connected(workspaceID: UUID, workspaceName: String)
}
```

- [ ] **Step 5: Run the tests and confirm they pass with zero warnings**

Run: `cd apps/shelf && swift build 2>&1 | grep -c "warning:"; swift test 2>&1 | tail -3`
Expected: `0`, then all tests pass. (The Keychain test may show a one-time macOS keychain prompt. Click "Always Allow". If it can't run in your environment, say so in the report.)

- [ ] **Step 6: swiftui-pro review** of `Sources/ShelfCore/**` (with `swift.md`, `hygiene.md`). Fix every finding.

- [ ] **Step 7: Commit**

```bash
git add apps/shelf/Sources/ShelfCore apps/shelf/Tests
git commit -m "feat(shelf): Orion client, Keychain token store, and backoff uploader"
```

---
### Task 7: Shelf HTTP API (connect, rooms, items)

**Read first:** `apps/web/src/app/api/devices/pair/route.ts` and its test (rate-limit + service-client pattern), and `apps/web/src/lib/supabase/device-pairing-server.ts`.

**Files:**
- Create: `apps/web/src/lib/supabase/shelf-server.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/shelf-responses.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/shelf-rate-limit.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/shelf-auth.ts` (+ `.test.ts`)
- Create: `apps/web/src/app/api/shelf/connect/route.ts` (+ `.test.ts`)
- Create: `apps/web/src/app/api/shelf/rooms/route.ts` (+ `.test.ts`)
- Create: `apps/web/src/app/api/shelf/items/route.ts` (+ `.test.ts`)
- Modify: `.env.example` (add `MELD_SHELF_SERVICE_ROLE_KEY=` under the device-pairing key), `README.md` env table (one row), `apps/web/.env.local` locally (same value as `MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY`; not committed)

**Interfaces:**
- Consumes: Task 1 (`ShelfConnectRequestSchema`, `ShelfUploadFieldsSchema`, `SHELF_ERROR_MESSAGES`, `INSPIRATION_LIMITS`, types), Task 2 (`mintCaptureToken`, `parseCaptureAuthorization`), `hashToken` + `normalizePairingCode` from `@meld/device-auth`, Task 5 (`saveInspirationItem`, `createInspirationRepository`, `createInspirationStorage`).
- Produces:
  - `createShelfServerClient(environment = process.env): SupabaseClient`
  - `SHELF_ERROR_STATUS: Record<ShelfErrorCode, number>`, `shelfError(code: ShelfErrorCode): Response`
  - `consumeShelfConnectAttempt(key: string): { allowed: boolean }`, `recordShelfConnectFailure(key: string): void`, `resetShelfRateLimit(): void`, `SHELF_CONNECT_FAILURE_LIMIT = 10`
  - `type ShelfPrincipal = { tokenId: string; userId: string; workspaceId: string }`, `authenticateShelfRequest(request: Request, client: SupabaseClient): Promise<ShelfPrincipal | null>`
  - Routes: `POST /api/shelf/connect`, `GET /api/shelf/rooms`, `POST /api/shelf/items` (spec E3)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/supabase/shelf-server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createShelfServerClient } from "./shelf-server";

describe("createShelfServerClient", () => {
  it("names the missing variable without printing any value", () => {
    expect(() => createShelfServerClient({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toThrow(
      "Invalid shelf configuration: MELD_SHELF_SERVICE_ROLE_KEY",
    );
    expect(() => createShelfServerClient({ MELD_SHELF_SERVICE_ROLE_KEY: "secret" })).toThrow(
      "Invalid shelf configuration: NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("builds a client when both values exist", () => {
    const client = createShelfServerClient({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      MELD_SHELF_SERVICE_ROLE_KEY: "service-role",
    });
    expect(typeof client.rpc).toBe("function");
  });
});
```

`apps/web/src/features/inspiration/shelf-responses.test.ts`:

```ts
import { SHELF_ERROR_MESSAGES, ShelfErrorCodeSchema } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { SHELF_ERROR_STATUS, shelfError } from "./shelf-responses";

describe("shelfError", () => {
  it("maps every code to the spec status and message", async () => {
    expect(SHELF_ERROR_STATUS).toEqual({
      unauthorized: 401,
      invalid_code: 400,
      rate_limited: 429,
      unsupported_type: 415,
      too_large: 413,
      invalid_image: 422,
      unavailable: 503,
    });
    for (const code of ShelfErrorCodeSchema.options) {
      const response = shelfError(code);
      expect(response.status).toBe(SHELF_ERROR_STATUS[code]);
      expect(await response.json()).toEqual({ error: { code, message: SHELF_ERROR_MESSAGES[code] } });
    }
  });
});
```

`apps/web/src/features/inspiration/shelf-rate-limit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SHELF_CONNECT_FAILURE_LIMIT,
  consumeShelfConnectAttempt,
  recordShelfConnectFailure,
  resetShelfRateLimit,
} from "./shelf-rate-limit";

describe("shelf connect rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetShelfRateLimit();
  });
  afterEach(() => vi.useRealTimers());

  it("blocks a key after the failure limit and leaves other keys alone", () => {
    for (let attempt = 0; attempt < SHELF_CONNECT_FAILURE_LIMIT; attempt += 1) {
      expect(consumeShelfConnectAttempt("1.1.1.1").allowed).toBe(true);
      recordShelfConnectFailure("1.1.1.1");
    }
    expect(consumeShelfConnectAttempt("1.1.1.1").allowed).toBe(false);
    expect(consumeShelfConnectAttempt("2.2.2.2").allowed).toBe(true);
  });

  it("forgets failures after ten minutes", () => {
    for (let attempt = 0; attempt < SHELF_CONNECT_FAILURE_LIMIT; attempt += 1) recordShelfConnectFailure("k");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(consumeShelfConnectAttempt("k").allowed).toBe(true);
  });
});
```

`apps/web/src/features/inspiration/shelf-auth.test.ts`:

```ts
import { hashToken, mintCaptureToken } from "@meld/device-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { authenticateShelfRequest } from "./shelf-auth";

const PRINCIPAL = {
  token_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  workspace_id: "33333333-3333-4333-8333-333333333333",
};

function request(authorization?: string) {
  return new Request("http://localhost/api/shelf/rooms", {
    headers: authorization ? { authorization } : {},
  });
}

describe("authenticateShelfRequest", () => {
  it("resolves a valid token by its hash only", async () => {
    const { token } = mintCaptureToken();
    const rpc = vi.fn(async () => ({ data: PRINCIPAL, error: null }));
    const principal = await authenticateShelfRequest(request(`Bearer ${token}`), { rpc } as unknown as SupabaseClient);
    expect(rpc).toHaveBeenCalledWith("resolve_capture_token", { presented_token_hash: hashToken(token) });
    expect(principal).toEqual({ tokenId: PRINCIPAL.token_id, userId: PRINCIPAL.user_id, workspaceId: PRINCIPAL.workspace_id });
  });

  it("returns null without calling the database for a malformed header", async () => {
    const rpc = vi.fn();
    expect(await authenticateShelfRequest(request("Bearer nope"), { rpc } as unknown as SupabaseClient)).toBeNull();
    expect(await authenticateShelfRequest(request(), { rpc } as unknown as SupabaseClient)).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns null for an unknown, revoked, or erroring token", async () => {
    const { token } = mintCaptureToken();
    for (const result of [{ data: null, error: null }, { data: null, error: { message: "boom" } }]) {
      const rpc = vi.fn(async () => result);
      expect(await authenticateShelfRequest(request(`Bearer ${token}`), { rpc } as unknown as SupabaseClient)).toBeNull();
    }
  });
});
```

`apps/web/src/app/api/shelf/connect/route.test.ts`:

```ts
import { hashToken } from "@meld/device-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createShelfServerClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));

import { SHELF_CONNECT_FAILURE_LIMIT, resetShelfRateLimit } from "@/features/inspiration/shelf-rate-limit";
import { POST } from "./route";

const WORKSPACE = "33333333-3333-4333-8333-333333333333";

function connectRequest(body: unknown) {
  return new Request("http://localhost/api/shelf/connect", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/shelf/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetShelfRateLimit();
    mocks.createShelfServerClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({ data: { workspace_id: WORKSPACE, workspace_name: "Mine" }, error: null });
  });

  it("redeems the normalized code hash and returns a fresh token", async () => {
    const response = await POST(connectRequest({ code: "abcd-1234", deviceName: "Studio Mac" }));
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ token: expect.stringMatching(/^orion_cap_[A-Za-z0-9_-]{43}$/), workspaceId: WORKSPACE, workspaceName: "Mine" });
    expect(mocks.rpc).toHaveBeenCalledWith("redeem_capture_connect_code", {
      connect_code_hash: hashToken("ABCD1234"),
      new_token_hash: hashToken(body.token),
      new_device_name: "Studio Mac",
    });
  });

  it("answers invalid_code for bad JSON, a bad body, or a rejected code", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "invalid_code" } });
    for (const body of ["{", { code: "" }, { code: "ABCD1234", deviceName: "Mac" }]) {
      const response = await POST(connectRequest(body));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("invalid_code");
    }
  });

  it("rate-limits repeated failures from one address", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "invalid_code" } });
    for (let attempt = 0; attempt < SHELF_CONNECT_FAILURE_LIMIT; attempt += 1) {
      await POST(connectRequest({ code: "ABCD1234", deviceName: "Mac" }));
    }
    const response = await POST(connectRequest({ code: "ABCD1234", deviceName: "Mac" }));
    expect(response.status).toBe(429);
  });

  it("answers unavailable when the server is misconfigured, logging no secrets", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createShelfServerClient.mockImplementation(() => {
      throw new Error("Invalid shelf configuration: MELD_SHELF_SERVICE_ROLE_KEY");
    });
    const response = await POST(connectRequest({ code: "ABCD1234", deviceName: "Mac" }));
    expect(response.status).toBe(503);
    expect(JSON.stringify(error.mock.calls)).not.toContain("ABCD1234");
    error.mockRestore();
  });
});
```

`apps/web/src/app/api/shelf/rooms/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));

import { GET } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const ROOM = "44444444-4444-4444-8444-444444444444";

describe("GET /api/shelf/rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({ rpc: mocks.rpc });
  });

  it("401s without a valid token", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/shelf/rooms"))).status).toBe(401);
  });

  it("returns room names only, for the token's user and workspace", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.rpc.mockResolvedValue({ data: [{ room_id: ROOM, room_name: "Login", project_name: "App" }], error: null });
    const response = await GET(new Request("http://localhost/api/shelf/rooms"));
    expect(mocks.rpc).toHaveBeenCalledWith("list_capture_rooms", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
    });
    expect(await response.json()).toEqual([{ roomId: ROOM, roomName: "Login", projectName: "App" }]);
  });

  it("503s when the room query fails", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await GET(new Request("http://localhost/api/shelf/rooms"))).status).toBe(503);
  });
});
```

`apps/web/src/app/api/shelf/items/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfServerClient: vi.fn(),
  authenticateShelfRequest: vi.fn(),
  saveInspirationItem: vi.fn(),
  createInspirationRepository: vi.fn(),
  createInspirationStorage: vi.fn(),
}));
vi.mock("@/lib/supabase/shelf-server", () => ({ createShelfServerClient: mocks.createShelfServerClient }));
vi.mock("@/features/inspiration/shelf-auth", () => ({ authenticateShelfRequest: mocks.authenticateShelfRequest }));
vi.mock("@/features/inspiration/save-inspiration-item", () => ({ saveInspirationItem: mocks.saveInspirationItem }));
vi.mock("@/features/inspiration/inspiration-repository", () => ({ createInspirationRepository: mocks.createInspirationRepository }));
vi.mock("@/features/inspiration/inspiration-storage", () => ({ createInspirationStorage: mocks.createInspirationStorage }));

import { POST } from "./route";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const ROOM = "44444444-4444-4444-8444-444444444444";
const ITEM = "55555555-5555-4555-8555-555555555555";

function upload(fields: Record<string, string | Blob> = {}) {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "image.png");
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return new Request("http://localhost/api/shelf/items", { method: "POST", body: form });
}

describe("POST /api/shelf/items", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createShelfServerClient.mockReturnValue({});
    mocks.authenticateShelfRequest.mockResolvedValue(PRINCIPAL);
    mocks.createInspirationRepository.mockReturnValue("repository");
    mocks.createInspirationStorage.mockReturnValue("storage");
    mocks.saveInspirationItem.mockResolvedValue({ ok: true, itemId: ITEM, duplicate: false, roomLinked: true });
  });

  it("401s without a valid token and never reads the body", async () => {
    mocks.authenticateShelfRequest.mockResolvedValue(null);
    expect((await POST(upload())).status).toBe(401);
    expect(mocks.saveInspirationItem).not.toHaveBeenCalled();
  });

  it("saves through the one write path as the token's user, channel shelf", async () => {
    const response = await POST(upload({ note: " nice ", sourceUrl: "https://pinterest.com/pin/1", roomId: ROOM }));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ itemId: ITEM, duplicate: false, roomLinked: true });
    expect(mocks.createInspirationRepository).toHaveBeenCalledWith({}, { kind: "capture", userId: PRINCIPAL.userId });
    expect(mocks.saveInspirationItem).toHaveBeenCalledWith(
      {
        workspaceId: PRINCIPAL.workspaceId,
        bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        note: "nice",
        sourceUrl: "https://pinterest.com/pin/1",
        roomId: ROOM,
        channel: "shelf",
      },
      { repository: "repository", storage: "storage" },
    );
  });

  it("answers 200 for a duplicate", async () => {
    mocks.saveInspirationItem.mockResolvedValue({ ok: true, itemId: ITEM, duplicate: true, roomLinked: false });
    expect((await POST(upload())).status).toBe(200);
  });

  it("drops a junk roomId and a non-web sourceUrl instead of failing", async () => {
    await POST(upload({ roomId: "not-a-uuid", sourceUrl: "javascript:alert(1)" }));
    expect(mocks.saveInspirationItem).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: null, sourceUrl: null }),
      expect.anything(),
    );
  });

  it.each([
    ["too_large", 413],
    ["unsupported_type", 415],
    ["invalid_image", 422],
    ["unavailable", 503],
  ] as const)("maps %s to %i", async (error, status) => {
    mocks.saveInspirationItem.mockResolvedValue({ ok: false, error });
    expect((await POST(upload())).status).toBe(status);
  });

  it("422s when there is no file", async () => {
    const form = new FormData();
    form.set("note", "x");
    const response = await POST(new Request("http://localhost/api/shelf/items", { method: "POST", body: form }));
    expect(response.status).toBe(422);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @meld/web test -- shelf`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement**

`apps/web/src/lib/supabase/shelf-server.ts`:

```ts
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
```

`apps/web/src/features/inspiration/shelf-responses.ts`:

```ts
import { SHELF_ERROR_MESSAGES, type ShelfErrorBody, type ShelfErrorCode } from "@meld/contracts";

export const SHELF_ERROR_STATUS: Record<ShelfErrorCode, number> = {
  unauthorized: 401,
  invalid_code: 400,
  rate_limited: 429,
  unsupported_type: 415,
  too_large: 413,
  invalid_image: 422,
  unavailable: 503,
};

export function shelfError(code: ShelfErrorCode): Response {
  const body: ShelfErrorBody = { error: { code, message: SHELF_ERROR_MESSAGES[code] } };
  return Response.json(body, { status: SHELF_ERROR_STATUS[code] });
}
```

`apps/web/src/features/inspiration/shelf-rate-limit.ts`:

```ts
/**
 * In-process limiter for shelf connect attempts, with the same semantics as
 * features/ai/pair-rate-limit.ts (kept separate so the two flows can't lock
 * each other out).
 */
export const SHELF_CONNECT_FAILURE_LIMIT = 10;
const WINDOW_MS = 10 * 60 * 1000;

const failuresByKey = new Map<string, number[]>();

function recentFailures(key: string, now: number): number[] {
  const recent = (failuresByKey.get(key) ?? []).filter((timestamp) => now - timestamp <= WINDOW_MS);
  if (recent.length === 0) failuresByKey.delete(key);
  else failuresByKey.set(key, recent);
  return recent;
}

export function consumeShelfConnectAttempt(key: string): { allowed: boolean } {
  return { allowed: recentFailures(key, Date.now()).length < SHELF_CONNECT_FAILURE_LIMIT };
}

export function recordShelfConnectFailure(key: string): void {
  const now = Date.now();
  failuresByKey.set(key, [...recentFailures(key, now), now]);
}

export function resetShelfRateLimit(): void {
  failuresByKey.clear();
}
```

`apps/web/src/features/inspiration/shelf-auth.ts`:

```ts
import "server-only";

import { hashToken, parseCaptureAuthorization } from "@meld/device-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export type ShelfPrincipal = { tokenId: string; userId: string; workspaceId: string };

const ResolvedTokenSchema = z.object({
  token_id: z.string().uuid(),
  user_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});

// Tokens are looked up by SHA-256 hash; the raw token is never compared or stored.
export async function authenticateShelfRequest(
  request: Request,
  client: SupabaseClient,
): Promise<ShelfPrincipal | null> {
  const token = parseCaptureAuthorization(request.headers.get("authorization"));
  if (!token) return null;
  const { data, error } = await client.rpc("resolve_capture_token", { presented_token_hash: hashToken(token) });
  if (error) return null;
  const parsed = ResolvedTokenSchema.safeParse(data);
  if (!parsed.success) return null;
  return { tokenId: parsed.data.token_id, userId: parsed.data.user_id, workspaceId: parsed.data.workspace_id };
}
```

`apps/web/src/app/api/shelf/connect/route.ts`:

```ts
import { ShelfConnectRequestSchema, type ShelfConnectResponse } from "@meld/contracts";
import { hashToken, mintCaptureToken, normalizePairingCode } from "@meld/device-auth";
import { z } from "zod";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { consumeShelfConnectAttempt, recordShelfConnectFailure } from "@/features/inspiration/shelf-rate-limit";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

const RedeemedSchema = z.object({ workspace_id: z.string().uuid(), workspace_name: z.string() });
const FALLBACK_RATE_LIMIT_KEY = "unknown-client";

function rateLimitKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || FALLBACK_RATE_LIMIT_KEY;
}

export async function POST(request: Request) {
  const key = rateLimitKey(request);
  if (!consumeShelfConnectAttempt(key).allowed) return shelfError("rate_limited");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    recordShelfConnectFailure(key);
    return shelfError("invalid_code");
  }
  const parsed = ShelfConnectRequestSchema.safeParse(body);
  if (!parsed.success) {
    recordShelfConnectFailure(key);
    return shelfError("invalid_code");
  }

  let supabase: ReturnType<typeof createShelfServerClient>;
  try {
    supabase = createShelfServerClient();
  } catch {
    console.error("Shelf server configuration error");
    return shelfError("unavailable");
  }

  const minted = mintCaptureToken();
  const { data, error } = await supabase.rpc("redeem_capture_connect_code", {
    connect_code_hash: hashToken(normalizePairingCode(parsed.data.code)),
    new_token_hash: minted.tokenHash,
    new_device_name: parsed.data.deviceName,
  });
  const redeemed = RedeemedSchema.safeParse(data);
  if (error || !redeemed.success) {
    // Never say why: expired, used, and unknown codes look the same.
    recordShelfConnectFailure(key);
    return shelfError("invalid_code");
  }

  const response: ShelfConnectResponse = {
    token: minted.token,
    workspaceId: redeemed.data.workspace_id,
    workspaceName: redeemed.data.workspace_name,
  };
  return Response.json(response, { status: 201 });
}
```

`apps/web/src/app/api/shelf/rooms/route.ts`:

```ts
import type { ShelfRoom } from "@meld/contracts";
import { z } from "zod";
import { authenticateShelfRequest } from "@/features/inspiration/shelf-auth";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

const RoomRowsSchema = z.array(
  z.object({ room_id: z.string().uuid(), room_name: z.string(), project_name: z.string() }),
);

export async function GET(request: Request) {
  let supabase: ReturnType<typeof createShelfServerClient>;
  try {
    supabase = createShelfServerClient();
  } catch {
    console.error("Shelf server configuration error");
    return shelfError("unavailable");
  }

  const principal = await authenticateShelfRequest(request, supabase);
  if (!principal) return shelfError("unauthorized");

  const { data, error } = await supabase.rpc("list_capture_rooms", {
    actor_user_id: principal.userId,
    target_workspace_id: principal.workspaceId,
  });
  const rows = RoomRowsSchema.safeParse(data);
  if (error || !rows.success) {
    console.error("list_capture_rooms failed");
    return shelfError("unavailable");
  }

  const rooms: ShelfRoom[] = rows.data.map((row) => ({
    roomId: row.room_id,
    roomName: row.room_name,
    projectName: row.project_name,
  }));
  return Response.json(rooms);
}
```

`apps/web/src/app/api/shelf/items/route.ts`:

```ts
import { ShelfUploadFieldsSchema, type ShelfUploadResponse } from "@meld/contracts";
import { z } from "zod";
import { createInspirationRepository } from "@/features/inspiration/inspiration-repository";
import { createInspirationStorage } from "@/features/inspiration/inspiration-storage";
import { saveInspirationItem } from "@/features/inspiration/save-inspiration-item";
import { authenticateShelfRequest } from "@/features/inspiration/shelf-auth";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

function textField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
}

// A room problem never fails the upload (spec E3), so a junk id becomes "no room".
function roomIdOrNull(value: string | null): string | null {
  return z.string().uuid().safeParse(value).success ? value : null;
}

export async function POST(request: Request) {
  let supabase: ReturnType<typeof createShelfServerClient>;
  try {
    supabase = createShelfServerClient();
  } catch {
    console.error("Shelf server configuration error");
    return shelfError("unavailable");
  }

  const principal = await authenticateShelfRequest(request, supabase);
  if (!principal) return shelfError("unauthorized");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return shelfError("invalid_image");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return shelfError("invalid_image");

  const fields = ShelfUploadFieldsSchema.parse({
    note: textField(form, "note"),
    sourceUrl: textField(form, "sourceUrl"),
    roomId: roomIdOrNull(textField(form, "roomId")),
  });

  const result = await saveInspirationItem(
    {
      workspaceId: principal.workspaceId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      note: fields.note,
      sourceUrl: fields.sourceUrl,
      roomId: fields.roomId,
      channel: "shelf",
    },
    {
      repository: createInspirationRepository(supabase, { kind: "capture", userId: principal.userId }),
      storage: createInspirationStorage(supabase),
    },
  );
  if (!result.ok) return shelfError(result.error);

  const response: ShelfUploadResponse = {
    itemId: result.itemId,
    duplicate: result.duplicate,
    roomLinked: result.roomLinked,
  };
  return Response.json(response, { status: result.duplicate ? 200 : 201 });
}
```

`.env.example`: directly under `MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY=` add:

```
# Server-only. Used by the Orion shelf routes (/api/shelf/*). Same local value as above.
MELD_SHELF_SERVICE_ROLE_KEY=
```

`README.md` env table: add a row after `INVITATION_FROM_EMAIL`:

```
| `MELD_SHELF_SERVICE_ROLE_KEY` | Server-only Supabase service-role key for the Mac shelf routes (`/api/shelf/*`). Locally, the same value as `MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY`. |
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @meld/web test -- shelf && pnpm --filter @meld/web typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Smoke-test the real routes** (dev server running with `MELD_SHELF_SERVICE_ROLE_KEY` in `apps/web/.env.local`)

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/shelf/rooms`
Expected: `401`.
Run: `curl -s -X POST -H 'content-type: application/json' -d '{"code":"ZZZZZZZZ","deviceName":"curl"}' http://127.0.0.1:3000/api/shelf/connect`
Expected: `{"error":{"code":"invalid_code","message":"That code didn't work. Make a new one in Orion Settings → Shelf."}}`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/supabase/shelf-server.ts apps/web/src/lib/supabase/shelf-server.test.ts \
  apps/web/src/features/inspiration/shelf-* apps/web/src/app/api/shelf .env.example README.md
git commit -m "feat(shelf-api): connect, rooms, and upload routes for the Mac shelf"
```

---
### Task 8: Readers, actions, shelf connection, and the E2E fake

**Read first:** `apps/web/src/features/design/design-references-reader.ts` (a `"use server"` reader that signs URLs in one batch), `apps/web/src/features/design/design-references-actions.ts` (action result shapes, fake branching), and `getStore()` in `apps/web/src/features/rooms/e2e-fake.ts` (fake state lives on `globalThis`).

**Files:**
- Modify: `apps/web/src/features/inspiration/inspiration-shared.ts` (add `ShelfTokenView` type and `toViews` helper) + its test
- Create: `apps/web/src/features/inspiration/inspiration-reader.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/inspiration-actions.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/shelf-connection.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/inspiration-fake.ts` (+ `.test.ts`)

**Interfaces:**
- Consumes: Task 5 (`createInspirationRepository`, `createInspirationStorage`, `saveInspirationItem`, `toItemView`, `INSPIRATION_ITEM_COLUMNS`), `isRoomFakeEnabled` from `@/features/rooms/e2e-gate`, `createClient` from `@/lib/supabase/server`, `mintPairingCode` from `@meld/device-auth`.
- Produces (all `async`; client components import these directly):
  - reader: `listLibrary({ workspaceId, offset }): Promise<LibraryPage>` where `LibraryPage = { items: InspirationItemView[]; hasMore: boolean }`; `listRoomInspiration(roomId): Promise<InspirationItemView[]>`; `listEditableRooms(workspaceId): Promise<ShelfRoom[]>`; `roomHasInspiration(roomId): Promise<boolean>`
  - actions: `uploadInspirationFromWeb(formData: FormData): Promise<SaveInspirationResult>` (fields `workspaceId`, `file`, optional `roomId`); `updateInspirationNote({ itemId, note }): Promise<{ status: "saved"; note: string | null } | { status: "error" }>`; `deleteInspirationItems({ itemIds }): Promise<{ status: "deleted"; count: number } | { status: "error" }>`; `linkInspirationToRoom({ roomId, itemIds }): Promise<{ status: "linked"; count: number } | { status: "error" }>`; `unlinkInspirationFromRoom({ roomId, itemIds }): Promise<{ status: "unlinked"; count: number } | { status: "error" }>`
  - shelf-connection: `createShelfConnectCode(workspaceId): Promise<{ status: "created"; code: string; expiresAt: string } | { status: "error"; message: string }>`; `listShelfTokens(workspaceId): Promise<ShelfTokenView[]>`; `revokeShelfToken(tokenId): Promise<{ status: "revoked" } | { status: "error" }>`
  - shared: `type ShelfTokenView = { id: string; deviceName: string; createdAt: string; lastUsedAt: string | null }`; `toViews(rows: unknown[], storage: InspirationStorage): Promise<InspirationItemView[]>`
  - fake: `fakeListLibrary`, `fakeListRoomInspiration`, `fakeListEditableRooms`, `fakeRoomHasInspiration`, `fakeSaveInspiration`, `fakeUpdateNote`, `fakeDeleteItems`, `fakeLinkToRoom`, `fakeUnlinkFromRoom`, `fakeCreateShelfConnectCode`, `fakeListShelfTokens`, `fakeRevokeShelfToken`, `resetInspirationFake`, and the constants `FAKE_SHELF_CONNECT_CODE = "ORION234"` and `FAKE_INSPIRATION_ROOM` (`{ roomId: E2E_DESIGN_ROOM_ID, roomName: "Design Room", projectName: "E2E Project" }`)

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/features/inspiration/inspiration-shared.test.ts`:

```ts
import { vi } from "vitest";
import { toViews } from "./inspiration-shared";

describe("toViews", () => {
  it("signs every path in one batch and reads room ids from the embedded links", async () => {
    const storage = {
      upload: vi.fn(),
      remove: vi.fn(),
      signUrls: vi.fn(async () => new Map([[ROW.storage_path, "https://signed/x"]])),
    };
    const views = await toViews([{ ...ROW, room_inspiration: [{ room_id: "33333333-3333-4333-8333-333333333333" }] }], storage);
    expect(storage.signUrls).toHaveBeenCalledWith([ROW.storage_path]);
    expect(views).toHaveLength(1);
    expect(views[0]?.imageUrl).toBe("https://signed/x");
    expect(views[0]?.roomIds).toEqual(["33333333-3333-4333-8333-333333333333"]);
  });

  it("drops malformed rows instead of failing the page", async () => {
    const storage = { upload: vi.fn(), remove: vi.fn(), signUrls: vi.fn(async () => new Map()) };
    expect(await toViews([{ nope: true }], storage)).toEqual([]);
  });
});
```

`apps/web/src/features/inspiration/inspiration-reader.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), isRoomFakeEnabled: vi.fn(() => false) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));

import { listEditableRooms, listLibrary, listRoomInspiration, roomHasInspiration } from "./inspiration-reader";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ROOM = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";

function row(id: string) {
  return {
    id,
    workspace_id: WORKSPACE,
    status: "ready",
    storage_path: `${WORKSPACE}/${id}.png`,
    mime_type: "image/png",
    width: 1,
    height: 1,
    source_url: null,
    note: null,
    capture_channel: "web",
    created_at: "2026-11-06T10:00:00.000Z",
    room_inspiration: [],
  };
}

// A thenable stand-in for a PostgREST query: every filter returns itself.
function query(result: { data: unknown; error: unknown; count?: number }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "range", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>;
}

function client(tables: Record<string, ReturnType<typeof query>>) {
  return {
    from: vi.fn((table: string) => tables[table]),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
    storage: {
      from: () => ({
        createSignedUrls: vi.fn(async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
          error: null,
        })),
      }),
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("listLibrary", () => {
  it("asks for one row more than a page to know whether more exist", async () => {
    const ids = Array.from({ length: 61 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    const items = query({ data: ids.map(row), error: null });
    mocks.createClient.mockResolvedValue(client({ inspiration_items: items }));

    const page = await listLibrary({ workspaceId: WORKSPACE, offset: 0 });

    expect(items.eq).toHaveBeenCalledWith("workspace_id", WORKSPACE);
    expect(items.eq).toHaveBeenCalledWith("status", "ready");
    expect(items.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(items.range).toHaveBeenCalledWith(0, 60);
    expect(page.items).toHaveLength(60);
    expect(page.hasMore).toBe(true);
    expect(page.items[0]?.imageUrl).toBe(`https://signed/${WORKSPACE}/${ids[0]}.png`);
  });

  it("returns an empty page for bad input or a query error", async () => {
    expect(await listLibrary({ workspaceId: "nope", offset: 0 })).toEqual({ items: [], hasMore: false });
    mocks.createClient.mockResolvedValue(client({ inspiration_items: query({ data: null, error: { message: "x" } }) }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await listLibrary({ workspaceId: WORKSPACE, offset: 0 })).toEqual({ items: [], hasMore: false });
  });
});

describe("listRoomInspiration", () => {
  it("reads linked items newest-link first", async () => {
    const links = query({
      data: [{ created_at: "2026-11-06T11:00:00.000Z", inspiration_items: row("11111111-1111-4111-8111-111111111111") }],
      error: null,
    });
    mocks.createClient.mockResolvedValue(client({ room_inspiration: links }));
    const items = await listRoomInspiration(ROOM);
    expect(links.eq).toHaveBeenCalledWith("room_id", ROOM);
    expect(links.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(items.map((item) => item.id)).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });
});

describe("roomHasInspiration", () => {
  it("is true when the count is above zero", async () => {
    mocks.createClient.mockResolvedValue(client({ room_inspiration: query({ data: null, error: null, count: 2 }) }));
    expect(await roomHasInspiration(ROOM)).toBe(true);
  });
});

describe("listEditableRooms", () => {
  it("lists the current user's editable rooms in this workspace as Project › Room", async () => {
    const participants = query({
      data: [{ room_id: ROOM, rooms: { name: "Login", workspace_id: WORKSPACE, projects: { name: "App" } } }],
      error: null,
    });
    mocks.createClient.mockResolvedValue(client({ room_participants: participants }));
    expect(await listEditableRooms(WORKSPACE)).toEqual([{ roomId: ROOM, roomName: "Login", projectName: "App" }]);
    expect(participants.eq).toHaveBeenCalledWith("user_id", USER);
    expect(participants.eq).toHaveBeenCalledWith("access", "edit");
    expect(participants.eq).toHaveBeenCalledWith("rooms.workspace_id", WORKSPACE);
  });
});
```

`apps/web/src/features/inspiration/inspiration-actions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
  saveInspirationItem: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));
vi.mock("./save-inspiration-item", () => ({ saveInspirationItem: mocks.saveInspirationItem }));

import {
  deleteInspirationItems,
  linkInspirationToRoom,
  unlinkInspirationFromRoom,
  updateInspirationNote,
  uploadInspirationFromWeb,
} from "./inspiration-actions";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ROOM = "33333333-3333-4333-8333-333333333333";
const ITEM = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, storage: { from: () => ({ remove: mocks.remove }) } });
});

describe("uploadInspirationFromWeb", () => {
  it("saves through the one write path with channel web", async () => {
    mocks.saveInspirationItem.mockResolvedValue({ ok: true, itemId: ITEM, duplicate: false, roomLinked: false });
    const form = new FormData();
    form.set("workspaceId", WORKSPACE);
    form.set("file", new Blob([new Uint8Array([1, 2])], { type: "image/png" }), "a.png");
    expect(await uploadInspirationFromWeb(form)).toEqual({ ok: true, itemId: ITEM, duplicate: false, roomLinked: false });
    expect(mocks.saveInspirationItem).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE, bytes: new Uint8Array([1, 2]), note: null, sourceUrl: null, roomId: null, channel: "web" },
      expect.objectContaining({ repository: expect.anything(), storage: expect.anything() }),
    );
  });

  it("rejects a missing file or workspace without saving", async () => {
    const form = new FormData();
    form.set("workspaceId", WORKSPACE);
    expect(await uploadInspirationFromWeb(form)).toEqual({ ok: false, error: "invalid_image" });
    expect(mocks.saveInspirationItem).not.toHaveBeenCalled();
  });
});

describe("updateInspirationNote", () => {
  it("saves a normalized note", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await updateInspirationNote({ itemId: ITEM, note: "  hi " })).toEqual({ status: "saved", note: "hi" });
    expect(mocks.rpc).toHaveBeenCalledWith("update_inspiration_note", { target_item_id: ITEM, item_note: "hi" });
  });

  it("reports an RPC error", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "not_found" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await updateInspirationNote({ itemId: ITEM, note: "x" })).toEqual({ status: "error" });
  });
});

describe("deleteInspirationItems", () => {
  it("deletes rows, then removes their storage objects", async () => {
    mocks.rpc.mockResolvedValue({ data: [`${WORKSPACE}/${ITEM}.png`], error: null });
    expect(await deleteInspirationItems({ itemIds: [ITEM] })).toEqual({ status: "deleted", count: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("delete_inspiration_items", { target_item_ids: [ITEM] });
    expect(mocks.remove).toHaveBeenCalledWith([`${WORKSPACE}/${ITEM}.png`]);
  });

  it("refuses more than the bulk limit", async () => {
    const ids = Array.from({ length: 101 }, () => ITEM);
    expect(await deleteInspirationItems({ itemIds: ids })).toEqual({ status: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("room links", () => {
  it("links and unlinks through the session RPCs", async () => {
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
    expect(await linkInspirationToRoom({ roomId: ROOM, itemIds: [ITEM] })).toEqual({ status: "linked", count: 1 });
    expect(await unlinkInspirationFromRoom({ roomId: ROOM, itemIds: [ITEM] })).toEqual({ status: "unlinked", count: 1 });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "link_inspiration_to_room", { target_room_id: ROOM, target_item_ids: [ITEM] });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "unlink_inspiration_from_room", { target_room_id: ROOM, target_item_ids: [ITEM] });
  });
});
```

`apps/web/src/features/inspiration/shelf-connection.test.ts`:

```ts
import { hashToken } from "@meld/device-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), isRoomFakeEnabled: vi.fn(() => false), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));

import { createShelfConnectCode, listShelfTokens, revokeShelfToken } from "./shelf-connection";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const TOKEN = "11111111-1111-4111-8111-111111111111";

function tokenQuery(data: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order"]) builder[method] = vi.fn(() => builder);
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ data, error: null });
  return builder as Record<string, ReturnType<typeof vi.fn>>;
}

beforeEach(() => vi.clearAllMocks());

describe("createShelfConnectCode", () => {
  it("stores only the code hash and returns the plain code once", async () => {
    mocks.rpc.mockResolvedValue({ data: "2026-11-06T10:10:00.000Z", error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    const result = await createShelfConnectCode(WORKSPACE);
    expect(result).toEqual({ status: "created", code: expect.stringMatching(/^[0-9A-Z]{8}$/), expiresAt: "2026-11-06T10:10:00.000Z" });
    if (result.status !== "created") throw new Error("expected created");
    expect(mocks.rpc).toHaveBeenCalledWith("create_capture_connect_code", {
      target_workspace_id: WORKSPACE,
      connect_code_hash: hashToken(result.code),
    });
  });

  it("explains the too-many-codes limit", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "too_many_codes" } });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    expect(await createShelfConnectCode(WORKSPACE)).toEqual({
      status: "error",
      message: "Use the code already on screen before making another one.",
    });
  });
});

describe("listShelfTokens", () => {
  it("selects explicit columns only (never token_hash) and active tokens only", async () => {
    const tokens = tokenQuery([{ id: TOKEN, device_name: "Studio Mac", created_at: "2026-11-06T10:00:00.000Z", last_used_at: null }]);
    mocks.createClient.mockResolvedValue({ from: vi.fn(() => tokens) });
    expect(await listShelfTokens(WORKSPACE)).toEqual([
      { id: TOKEN, deviceName: "Studio Mac", createdAt: "2026-11-06T10:00:00.000Z", lastUsedAt: null },
    ]);
    expect(tokens.select).toHaveBeenCalledWith("id,device_name,created_at,last_used_at");
    expect(tokens.is).toHaveBeenCalledWith("revoked_at", null);
  });
});

describe("revokeShelfToken", () => {
  it("revokes through the RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
    expect(await revokeShelfToken(TOKEN)).toEqual({ status: "revoked" });
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_capture_token", { target_token_id: TOKEN });
  });
});
```

`apps/web/src/features/inspiration/inspiration-fake.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  FAKE_INSPIRATION_ROOM,
  fakeDeleteItems,
  fakeLinkToRoom,
  fakeListLibrary,
  fakeListRoomInspiration,
  fakeRoomHasInspiration,
  fakeSaveInspiration,
  fakeUnlinkFromRoom,
  resetInspirationFake,
} from "./inspiration-fake";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);

beforeEach(() => resetInspirationFake());

describe("inspiration fake", () => {
  it("saves, dedupes, links, unlinks, and deletes like the real path", () => {
    const first = fakeSaveInspiration({ workspaceId: WORKSPACE, bytes: PNG, mimeType: "image/png" });
    const again = fakeSaveInspiration({ workspaceId: WORKSPACE, bytes: PNG, mimeType: "image/png" });
    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(again).toMatchObject({ ok: true, duplicate: true });
    if (!first.ok) throw new Error("expected ok");

    expect(fakeListLibrary({ workspaceId: WORKSPACE, offset: 0 }).items).toHaveLength(1);
    expect(fakeListLibrary({ workspaceId: WORKSPACE, offset: 0 }).items[0]?.imageUrl).toMatch(/^data:image\/png;base64,/);

    fakeLinkToRoom(FAKE_INSPIRATION_ROOM.roomId, [first.itemId]);
    expect(fakeRoomHasInspiration(FAKE_INSPIRATION_ROOM.roomId)).toBe(true);
    expect(fakeListRoomInspiration(FAKE_INSPIRATION_ROOM.roomId).map((item) => item.id)).toEqual([first.itemId]);

    fakeUnlinkFromRoom(FAKE_INSPIRATION_ROOM.roomId, [first.itemId]);
    expect(fakeRoomHasInspiration(FAKE_INSPIRATION_ROOM.roomId)).toBe(false);

    expect(fakeDeleteItems([first.itemId])).toBe(1);
    expect(fakeListLibrary({ workspaceId: WORKSPACE, offset: 0 }).items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @meld/web test -- features/inspiration`
Expected: FAIL (missing modules and the missing `toViews` export).

- [ ] **Step 3: Implement**

Append to `apps/web/src/features/inspiration/inspiration-shared.ts`:

```ts
import type { InspirationStorage } from "./inspiration-storage";

export type ShelfTokenView = {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt: string | null;
};

const EmbeddedLinksSchema = z.array(z.object({ room_id: z.string().uuid() })).catch([]);

// Rows carry an embedded `room_inspiration(room_id)` list. All storage paths
// are signed in one call rather than one call per tile.
export async function toViews(rows: unknown[], storage: InspirationStorage): Promise<InspirationItemView[]> {
  const parsed = rows.flatMap((row) => {
    const result = InspirationItemRowSchema.safeParse(row);
    if (!result.success) return [];
    const links = EmbeddedLinksSchema.parse((row as { room_inspiration?: unknown }).room_inspiration ?? []);
    return [{ raw: row, row: result.data, roomIds: links.map((link) => link.room_id) }];
  });
  const urls = await storage.signUrls(parsed.map(({ row }) => row.storage_path));
  return parsed.flatMap(({ raw, row, roomIds }) => {
    const view = toItemView(raw, { imageUrl: urls.get(row.storage_path) ?? null, roomIds });
    return view ? [view] : [];
  });
}
```

(Move the new `import type` line to the top of the file with the other imports.)

`apps/web/src/features/inspiration/inspiration-reader.ts`:

```ts
"use server";

import { INSPIRATION_LIMITS, type InspirationItemView, type ShelfRoom } from "@meld/contracts";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { INSPIRATION_ITEM_COLUMNS, toViews } from "./inspiration-shared";
import { createInspirationStorage } from "./inspiration-storage";

export type LibraryPage = { items: InspirationItemView[]; hasMore: boolean };

const EMPTY_PAGE: LibraryPage = { items: [], hasMore: false };
const ITEM_WITH_LINKS = `${INSPIRATION_ITEM_COLUMNS},room_inspiration(room_id)`;
const LibraryInput = z.object({ workspaceId: z.string().uuid(), offset: z.number().int().min(0) }).strict();
const Uuid = z.string().uuid();

export async function listLibrary(input: z.input<typeof LibraryInput>): Promise<LibraryPage> {
  const parsed = LibraryInput.safeParse(input);
  if (!parsed.success) return EMPTY_PAGE;
  if (isRoomFakeEnabled()) {
    const { fakeListLibrary } = await import("./inspiration-fake");
    return fakeListLibrary(parsed.data);
  }

  const { workspaceId, offset } = parsed.data;
  const supabase = await createClient(new Headers());
  // One extra row tells us whether "Load more" should show.
  const { data, error } = await supabase
    .from("inspiration_items")
    .select(ITEM_WITH_LINKS)
    .eq("workspace_id", workspaceId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .range(offset, offset + INSPIRATION_LIMITS.pageSize);
  if (error || !data) {
    console.error("listLibrary failed", { code: error?.code });
    return EMPTY_PAGE;
  }
  const rows = data.slice(0, INSPIRATION_LIMITS.pageSize);
  return {
    items: await toViews(rows, createInspirationStorage(supabase)),
    hasMore: data.length > INSPIRATION_LIMITS.pageSize,
  };
}

const LinkRowsSchema = z.array(z.object({ created_at: z.string(), inspiration_items: z.unknown() }));

export async function listRoomInspiration(roomId: string): Promise<InspirationItemView[]> {
  if (!Uuid.safeParse(roomId).success) return [];
  if (isRoomFakeEnabled()) {
    const { fakeListRoomInspiration } = await import("./inspiration-fake");
    return fakeListRoomInspiration(roomId);
  }

  const supabase = await createClient(new Headers());
  const { data, error } = await supabase
    .from("room_inspiration")
    .select(`created_at,inspiration_items(${ITEM_WITH_LINKS})`)
    .eq("room_id", roomId)
    .order("created_at", { ascending: false });
  const links = LinkRowsSchema.safeParse(data);
  if (error || !links.success) {
    console.error("listRoomInspiration failed", { code: error?.code });
    return [];
  }
  return toViews(
    links.data.map((link) => link.inspiration_items),
    createInspirationStorage(supabase),
  );
}

export async function roomHasInspiration(roomId: string): Promise<boolean> {
  if (!Uuid.safeParse(roomId).success) return false;
  if (isRoomFakeEnabled()) {
    const { fakeRoomHasInspiration } = await import("./inspiration-fake");
    return fakeRoomHasInspiration(roomId);
  }
  const supabase = await createClient(new Headers());
  const { count, error } = await supabase
    .from("room_inspiration")
    .select("item_id", { count: "exact", head: true })
    .eq("room_id", roomId);
  return !error && (count ?? 0) > 0;
}

const EditableRoomRowsSchema = z.array(
  z.object({
    room_id: z.string().uuid(),
    rooms: z.object({ name: z.string(), workspace_id: z.string().uuid(), projects: z.object({ name: z.string() }) }),
  }),
);

export async function listEditableRooms(workspaceId: string): Promise<ShelfRoom[]> {
  if (!Uuid.safeParse(workspaceId).success) return [];
  if (isRoomFakeEnabled()) {
    const { fakeListEditableRooms } = await import("./inspiration-fake");
    return fakeListEditableRooms();
  }

  const supabase = await createClient(new Headers());
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("room_participants")
    .select("room_id,rooms!inner(name,workspace_id,projects(name))")
    .eq("user_id", userId)
    .eq("access", "edit")
    .eq("rooms.workspace_id", workspaceId);
  const rows = EditableRoomRowsSchema.safeParse(data);
  if (error || !rows.success) {
    console.error("listEditableRooms failed", { code: error?.code });
    return [];
  }
  return rows.data
    .map((row) => ({ roomId: row.room_id, roomName: row.rooms.name, projectName: row.rooms.projects.name }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName) || a.roomName.localeCompare(b.roomName));
}
```

`apps/web/src/features/inspiration/inspiration-actions.ts`:

```ts
"use server";

import { INSPIRATION_LIMITS, normalizeNote } from "@meld/contracts";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { createInspirationRepository } from "./inspiration-repository";
import { createInspirationStorage } from "./inspiration-storage";
import { saveInspirationItem, type SaveInspirationResult } from "./save-inspiration-item";

const Uuid = z.string().uuid();
const ItemIds = z.array(Uuid).min(1).max(INSPIRATION_LIMITS.bulkMax);

export async function uploadInspirationFromWeb(formData: FormData): Promise<SaveInspirationResult> {
  const workspaceId = Uuid.safeParse(formData.get("workspaceId"));
  const file = formData.get("file");
  if (!workspaceId.success || !(file instanceof Blob)) return { ok: false, error: "invalid_image" };
  const roomIdValue = formData.get("roomId");
  const roomId = Uuid.safeParse(roomIdValue).success ? (roomIdValue as string) : null;
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isRoomFakeEnabled()) {
    const { fakeSaveInspiration } = await import("./inspiration-fake");
    return fakeSaveInspiration({ workspaceId: workspaceId.data, bytes, mimeType: file.type, roomId });
  }

  const supabase = await createClient(new Headers());
  return saveInspirationItem(
    { workspaceId: workspaceId.data, bytes, note: null, sourceUrl: null, roomId, channel: "web" },
    {
      repository: createInspirationRepository(supabase, { kind: "session" }),
      storage: createInspirationStorage(supabase),
    },
  );
}

const NoteInput = z.object({ itemId: Uuid, note: z.string() }).strict();

export async function updateInspirationNote(
  input: z.input<typeof NoteInput>,
): Promise<{ status: "saved"; note: string | null } | { status: "error" }> {
  const parsed = NoteInput.safeParse(input);
  if (!parsed.success) return { status: "error" };
  const note = normalizeNote(parsed.data.note);
  if (isRoomFakeEnabled()) {
    const { fakeUpdateNote } = await import("./inspiration-fake");
    fakeUpdateNote(parsed.data.itemId, note);
    return { status: "saved", note };
  }
  const supabase = await createClient(new Headers());
  const { error } = await supabase.rpc("update_inspiration_note", { target_item_id: parsed.data.itemId, item_note: note });
  if (error) {
    console.error("updateInspirationNote failed", { code: error.message });
    return { status: "error" };
  }
  return { status: "saved", note };
}

const DeleteInput = z.object({ itemIds: ItemIds }).strict();

export async function deleteInspirationItems(
  input: z.input<typeof DeleteInput>,
): Promise<{ status: "deleted"; count: number } | { status: "error" }> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const { fakeDeleteItems } = await import("./inspiration-fake");
    return { status: "deleted", count: fakeDeleteItems(parsed.data.itemIds) };
  }
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("delete_inspiration_items", { target_item_ids: parsed.data.itemIds });
  const paths = z.array(z.string()).safeParse(data);
  if (error || !paths.success) {
    console.error("deleteInspirationItems failed", { code: error?.message });
    return { status: "error" };
  }
  // The rows are gone either way; an orphaned object is harmless and private.
  await createInspirationStorage(supabase)
    .remove(paths.data)
    .catch(() => console.error("inspiration object removal failed", { count: paths.data.length }));
  return { status: "deleted", count: paths.data.length };
}

const LinkInput = z.object({ roomId: Uuid, itemIds: ItemIds }).strict();

export async function linkInspirationToRoom(
  input: z.input<typeof LinkInput>,
): Promise<{ status: "linked"; count: number } | { status: "error" }> {
  const parsed = LinkInput.safeParse(input);
  if (!parsed.success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const { fakeLinkToRoom } = await import("./inspiration-fake");
    return { status: "linked", count: fakeLinkToRoom(parsed.data.roomId, parsed.data.itemIds) };
  }
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("link_inspiration_to_room", {
    target_room_id: parsed.data.roomId,
    target_item_ids: parsed.data.itemIds,
  });
  if (error) {
    console.error("linkInspirationToRoom failed", { code: error.message });
    return { status: "error" };
  }
  return { status: "linked", count: Number(data) };
}

export async function unlinkInspirationFromRoom(
  input: z.input<typeof LinkInput>,
): Promise<{ status: "unlinked"; count: number } | { status: "error" }> {
  const parsed = LinkInput.safeParse(input);
  if (!parsed.success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const { fakeUnlinkFromRoom } = await import("./inspiration-fake");
    return { status: "unlinked", count: fakeUnlinkFromRoom(parsed.data.roomId, parsed.data.itemIds) };
  }
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("unlink_inspiration_from_room", {
    target_room_id: parsed.data.roomId,
    target_item_ids: parsed.data.itemIds,
  });
  if (error) {
    console.error("unlinkInspirationFromRoom failed", { code: error.message });
    return { status: "error" };
  }
  return { status: "unlinked", count: Number(data) };
}
```

`apps/web/src/features/inspiration/shelf-connection.ts`:

```ts
"use server";

import { mintPairingCode } from "@meld/device-auth";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import type { ShelfTokenView } from "./inspiration-shared";

const Uuid = z.string().uuid();
const TOO_MANY_CODES = "Use the code already on screen before making another one.";
const CODE_FAILED = "Couldn't make a code. Try again.";

export async function createShelfConnectCode(
  workspaceId: string,
): Promise<{ status: "created"; code: string; expiresAt: string } | { status: "error"; message: string }> {
  if (!Uuid.safeParse(workspaceId).success) return { status: "error", message: CODE_FAILED };
  if (isRoomFakeEnabled()) {
    const { fakeCreateShelfConnectCode } = await import("./inspiration-fake");
    return fakeCreateShelfConnectCode();
  }
  const { code, codeHash } = mintPairingCode();
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("create_capture_connect_code", {
    target_workspace_id: workspaceId,
    connect_code_hash: codeHash,
  });
  if (error) {
    return { status: "error", message: error.message === "too_many_codes" ? TOO_MANY_CODES : CODE_FAILED };
  }
  return { status: "created", code, expiresAt: String(data) };
}

const TokenRowsSchema = z.array(
  z.object({ id: z.string().uuid(), device_name: z.string(), created_at: z.string(), last_used_at: z.string().nullable() }),
);

export async function listShelfTokens(workspaceId: string): Promise<ShelfTokenView[]> {
  if (!Uuid.safeParse(workspaceId).success) return [];
  if (isRoomFakeEnabled()) {
    const { fakeListShelfTokens } = await import("./inspiration-fake");
    return fakeListShelfTokens();
  }
  const supabase = await createClient(new Headers());
  // Explicit columns: token_hash is not granted to the browser role at all.
  const { data } = await supabase
    .from("capture_tokens")
    .select("id,device_name,created_at,last_used_at")
    .eq("workspace_id", workspaceId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  const rows = TokenRowsSchema.safeParse(data ?? []);
  if (!rows.success) return [];
  return rows.data.map((row) => ({
    id: row.id,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }));
}

export async function revokeShelfToken(tokenId: string): Promise<{ status: "revoked" } | { status: "error" }> {
  if (!Uuid.safeParse(tokenId).success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const { fakeRevokeShelfToken } = await import("./inspiration-fake");
    fakeRevokeShelfToken(tokenId);
    return { status: "revoked" };
  }
  const supabase = await createClient(new Headers());
  const { error } = await supabase.rpc("revoke_capture_token", { target_token_id: tokenId });
  return error ? { status: "error" } : { status: "revoked" };
}
```

`apps/web/src/features/inspiration/inspiration-fake.ts`:

```ts
import { createHash, randomUUID } from "node:crypto";
import {
  INSPIRATION_LIMITS,
  InspirationMimeTypeSchema,
  type InspirationItemView,
  type ShelfRoom,
} from "@meld/contracts";
import { E2E_DESIGN_ROOM_ID } from "@/features/rooms/e2e-fake";
import type { ShelfTokenView } from "./inspiration-shared";
import type { SaveInspirationResult } from "./save-inspiration-item";

// In-memory stand-in used only when MELD_E2E_FAKE_* is on (Playwright).
// Lives on globalThis so server actions and pages share one store, like
// features/rooms/e2e-fake.ts.
export const FAKE_SHELF_CONNECT_CODE = "ORION234";
export const FAKE_INSPIRATION_ROOM: ShelfRoom = {
  roomId: E2E_DESIGN_ROOM_ID,
  roomName: "Design Room",
  projectName: "E2E Project",
};

type FakeItem = InspirationItemView & { contentHash: string };
type FakeStore = {
  items: FakeItem[];
  links: { roomId: string; itemId: string; createdAt: string }[];
  tokens: ShelfTokenView[];
};
const STORE_KEY = "__orionInspirationFake";

function store(): FakeStore {
  const globalState = globalThis as typeof globalThis & { [STORE_KEY]?: FakeStore };
  globalState[STORE_KEY] ??= { items: [], links: [], tokens: [] };
  return globalState[STORE_KEY];
}

export function resetInspirationFake(): void {
  const globalState = globalThis as typeof globalThis & { [STORE_KEY]?: FakeStore };
  globalState[STORE_KEY] = { items: [], links: [], tokens: [] };
}

function withRoomIds(item: FakeItem): InspirationItemView {
  const { contentHash: _contentHash, ...view } = item;
  return {
    ...view,
    roomIds: store().links.filter((link) => link.itemId === item.id).map((link) => link.roomId),
  };
}

export function fakeSaveInspiration(input: {
  workspaceId: string;
  bytes: Uint8Array;
  mimeType: string;
  roomId?: string | null;
}): SaveInspirationResult {
  const mimeType = InspirationMimeTypeSchema.safeParse(input.mimeType);
  if (!mimeType.success) return { ok: false, error: "unsupported_type" };
  if (input.bytes.byteLength > INSPIRATION_LIMITS.maxBytes) return { ok: false, error: "too_large" };
  const contentHash = createHash("sha256").update(input.bytes).digest("hex");
  const existing = store().items.find((item) => item.contentHash === contentHash);
  const item: FakeItem = existing ?? {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    imageUrl: `data:${mimeType.data};base64,${Buffer.from(input.bytes).toString("base64")}`,
    width: 1,
    height: 1,
    mimeType: mimeType.data,
    sourceUrl: null,
    note: null,
    captureChannel: "web",
    createdAt: new Date().toISOString(),
    roomIds: [],
    contentHash,
  };
  if (!existing) store().items.unshift(item);
  const roomLinked = input.roomId ? fakeLinkToRoom(input.roomId, [item.id]) >= 0 : false;
  return { ok: true, itemId: item.id, duplicate: Boolean(existing), roomLinked };
}

export function fakeListLibrary(input: { workspaceId: string; offset: number }) {
  const all = store().items.filter((item) => item.workspaceId === input.workspaceId);
  const page = all.slice(input.offset, input.offset + INSPIRATION_LIMITS.pageSize);
  return { items: page.map(withRoomIds), hasMore: all.length > input.offset + INSPIRATION_LIMITS.pageSize };
}

export function fakeListRoomInspiration(roomId: string): InspirationItemView[] {
  return store()
    .links.filter((link) => link.roomId === roomId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .flatMap((link) => store().items.filter((item) => item.id === link.itemId))
    .map(withRoomIds);
}

export function fakeRoomHasInspiration(roomId: string): boolean {
  return store().links.some((link) => link.roomId === roomId);
}

export function fakeListEditableRooms(): ShelfRoom[] {
  return [FAKE_INSPIRATION_ROOM];
}

export function fakeUpdateNote(itemId: string, note: string | null): void {
  const item = store().items.find((candidate) => candidate.id === itemId);
  if (item) item.note = note;
}

export function fakeDeleteItems(itemIds: string[]): number {
  const before = store().items.length;
  store().items = store().items.filter((item) => !itemIds.includes(item.id));
  store().links = store().links.filter((link) => !itemIds.includes(link.itemId));
  return before - store().items.length;
}

export function fakeLinkToRoom(roomId: string, itemIds: string[]): number {
  let added = 0;
  for (const itemId of itemIds) {
    if (!store().links.some((link) => link.roomId === roomId && link.itemId === itemId)) {
      store().links.push({ roomId, itemId, createdAt: new Date().toISOString() });
      added += 1;
    }
  }
  return added;
}

export function fakeUnlinkFromRoom(roomId: string, itemIds: string[]): number {
  const before = store().links.length;
  store().links = store().links.filter((link) => !(link.roomId === roomId && itemIds.includes(link.itemId)));
  return before - store().links.length;
}

export function fakeCreateShelfConnectCode() {
  return {
    status: "created" as const,
    code: FAKE_SHELF_CONNECT_CODE,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

export function fakeListShelfTokens(): ShelfTokenView[] {
  return store().tokens;
}

export function fakeRevokeShelfToken(tokenId: string): void {
  store().tokens = store().tokens.filter((token) => token.id !== tokenId);
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm --filter @meld/web test -- features/inspiration && pnpm --filter @meld/web typecheck && pnpm check:astryx`
Expected: PASS; typecheck exit 0; astryx check clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/inspiration
git commit -m "feat(inspiration): library readers, actions, shelf connection, and E2E fake"
```

---
### Task 9: Inspiration Library page

**Read first:** `apps/web/src/features/projects/components/move-room-dialog.tsx` (Dialog → Layout → DialogHeader/LayoutContent/LayoutFooter pattern), `apps/web/src/app/(app)/[workspaceId]/settings/devices/page.tsx` (page Layout), and `apps/web/src/features/design/components/agents-transcript.tsx` lines 95–112 (the accepted `<img>` pattern). Before using any component, run `pnpm exec astryx component <Name>` for: `Grid`, `AspectRatio`, `ClickableCard`, `CheckboxInput`, `FileInput`, `Skeleton`, `EmptyState`, `Dialog`, `Selector`, `TextArea`, `Lightbox`, `Link`, `Button`, `Toast`.

**Files:**
- Create: `apps/web/src/features/inspiration/client-image-prep.ts` (+ `.test.ts`)
- Create: `apps/web/src/features/inspiration/use-inspiration-library.ts` (+ `.test.tsx`)
- Create: `apps/web/src/features/inspiration/components/inspiration-tile.tsx` (+ `.test.tsx`)
- Create: `apps/web/src/features/inspiration/components/inspiration-grid.tsx` (+ `.test.tsx`)
- Create: `apps/web/src/features/inspiration/components/selection-bar.tsx` (+ `.test.tsx`)
- Create: `apps/web/src/features/inspiration/components/confirm-delete-dialog.tsx` (+ `.test.tsx`)
- Create: `apps/web/src/features/inspiration/components/add-to-room-dialog.tsx` (+ `.test.tsx`)
- Create: `apps/web/src/features/inspiration/components/inspiration-detail.tsx` (+ `.test.tsx`)
- Create: `apps/web/src/features/inspiration/components/inspiration-library-view.tsx` (+ `.test.tsx`)
- Create: `apps/web/src/app/(app)/[workspaceId]/inspiration/page.tsx`
- Modify: `apps/web/src/ui/workspace-navigation.tsx` (add the sidebar item) + `workspace-navigation.test.tsx` (one assertion)

**Interfaces:**
- Consumes: Task 8 readers and actions; `SHELF_ERROR_MESSAGES`, `INSPIRATION_LIMITS` from contracts.
- Produces (used by Tasks 10 and 13):
  - `InspirationGrid({ items, selectedIds, onSelectedChange, onOpen, uploadingCount? })`
  - `InspirationDetail({ workspaceId, items, openItemId, rooms, onOpenItemChange, onNoteSaved, onDelete })`
  - `SelectionBar({ count, actions, onClear })` where `actions: { label: string; variant?: "primary" | "secondary" | "destructive"; onClick: () => void }[]`
  - `ConfirmDeleteDialog({ isOpen, count, onOpenChange, onConfirm, title?, description?, confirmLabel? })`
  - `planImagePrep(input: { type: string; size: number; width: number; height: number }): PrepPlan`, `prepareImageForUpload(file: File): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }>`
  - `mergeFirstPage(page: LibraryPage, current: InspirationItemView[]): InspirationItemView[]`
  - test ids: `inspiration-tile`, `inspiration-grid`, `inspiration-selection-bar`, `inspiration-detail`, `inspiration-empty`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/inspiration/client-image-prep.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planImagePrep } from "./client-image-prep";

const small = { size: 1000, width: 800, height: 600 };

describe("planImagePrep", () => {
  it("passes stored formats through when within limits", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(planImagePrep({ type, ...small })).toEqual({ kind: "pass" });
    }
  });

  it("turns a GIF into a PNG still and other images into PNG", () => {
    expect(planImagePrep({ type: "image/gif", ...small })).toEqual({ kind: "encode", type: "image/png", maxEdge: null });
    expect(planImagePrep({ type: "image/bmp", ...small })).toEqual({ kind: "encode", type: "image/png", maxEdge: null });
  });

  it("shrinks long or heavy images to a JPEG at the max edge", () => {
    expect(planImagePrep({ type: "image/png", size: 1000, width: 5000, height: 10 })).toEqual({
      kind: "encode",
      type: "image/jpeg",
      maxEdge: 4096,
    });
    expect(planImagePrep({ type: "image/jpeg", size: 20_000_000, width: 3000, height: 3000 })).toEqual({
      kind: "encode",
      type: "image/jpeg",
      maxEdge: 4096,
    });
  });

  it("sends HEIC to the shelf and rejects non-images", () => {
    expect(planImagePrep({ type: "image/heic", ...small })).toEqual({
      kind: "reject",
      message: "Drop HEIC photos on the menu-bar shelf instead.",
    });
    expect(planImagePrep({ type: "application/pdf", ...small })).toEqual({ kind: "reject", message: "Only images can be saved." });
  });
});
```

`apps/web/src/features/inspiration/use-inspiration-library.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { InspirationItemView } from "@meld/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  listLibrary: vi.fn(),
  uploadInspirationFromWeb: vi.fn(),
  deleteInspirationItems: vi.fn(),
  linkInspirationToRoom: vi.fn(),
  updateInspirationNote: vi.fn(),
  prepareImageForUpload: vi.fn(),
}));
vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("./inspiration-reader", () => ({ listLibrary: mocks.listLibrary }));
vi.mock("./inspiration-actions", () => ({
  uploadInspirationFromWeb: mocks.uploadInspirationFromWeb,
  deleteInspirationItems: mocks.deleteInspirationItems,
  linkInspirationToRoom: mocks.linkInspirationToRoom,
  updateInspirationNote: mocks.updateInspirationNote,
}));
vi.mock("./client-image-prep", () => ({ prepareImageForUpload: mocks.prepareImageForUpload }));

import { mergeFirstPage, useInspirationLibrary } from "./use-inspiration-library";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ROOM = { roomId: "33333333-3333-4333-8333-333333333333", roomName: "Login", projectName: "App" };

function item(id: string, createdAt = "2026-11-06T10:00:00.000Z"): InspirationItemView {
  return {
    id,
    workspaceId: WORKSPACE,
    imageUrl: `https://signed/${id}`,
    width: 1,
    height: 1,
    mimeType: "image/png",
    sourceUrl: null,
    note: null,
    captureChannel: "web",
    createdAt,
    roomIds: [],
  };
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listLibrary.mockResolvedValue({ items: [item(A), item(B)], hasMore: false });
});

describe("mergeFirstPage", () => {
  it("replaces everything when the fresh page is the whole library", () => {
    expect(mergeFirstPage({ items: [item(B)], hasMore: false }, [item(A), item(B)])).toEqual([item(B)]);
  });

  it("keeps older loaded items beyond the fresh first page", () => {
    const fresh = { items: [item(A, "2026-11-06T12:00:00.000Z")], hasMore: true };
    const older = item(B, "2026-11-01T10:00:00.000Z");
    expect(mergeFirstPage(fresh, [older])).toEqual([fresh.items[0], older]);
  });
});

describe("useInspirationLibrary", () => {
  function setup() {
    return renderHook(() => useInspirationLibrary({ workspaceId: WORKSPACE, initialPage: { items: [item(A), item(B)], hasMore: false } }));
  }

  it("toggles and clears selection", () => {
    const { result } = setup();
    act(() => result.current.setSelected(A, true));
    expect([...result.current.selectedIds]).toEqual([A]);
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("deletes the selection and tells the owner", async () => {
    mocks.deleteInspirationItems.mockResolvedValue({ status: "deleted", count: 1 });
    const { result } = setup();
    act(() => result.current.setSelected(A, true));
    await act(() => result.current.deleteSelected());
    expect(mocks.deleteInspirationItems).toHaveBeenCalledWith({ itemIds: [A] });
    expect(result.current.items.map((entry) => entry.id)).toEqual([B]);
    expect(mocks.toast).toHaveBeenCalledWith({ type: "info", body: "Deleted 1 image." });
  });

  it("adds the selection to a room and records the link locally", async () => {
    mocks.linkInspirationToRoom.mockResolvedValue({ status: "linked", count: 2 });
    const { result } = setup();
    act(() => {
      result.current.setSelected(A, true);
      result.current.setSelected(B, true);
    });
    await act(() => result.current.addSelectedToRoom(ROOM));
    expect(mocks.linkInspirationToRoom).toHaveBeenCalledWith({ roomId: ROOM.roomId, itemIds: [A, B] });
    expect(result.current.items.every((entry) => entry.roomIds.includes(ROOM.roomId))).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith({ type: "info", body: "Added 2 images to Login." });
  });

  it("uploads prepared files, reports failures by message, then refreshes", async () => {
    mocks.prepareImageForUpload
      .mockResolvedValueOnce({ ok: true, blob: new Blob([new Uint8Array([1])], { type: "image/png" }) })
      .mockResolvedValueOnce({ ok: false, message: "Only images can be saved." });
    mocks.uploadInspirationFromWeb.mockResolvedValue({ ok: false, error: "too_large" });
    const { result } = setup();
    await act(() =>
      result.current.uploadFiles([new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.pdf")]),
    );
    expect(mocks.uploadInspirationFromWeb).toHaveBeenCalledTimes(1);
    const form = mocks.uploadInspirationFromWeb.mock.calls[0]?.[0] as FormData;
    expect(form.get("workspaceId")).toBe(WORKSPACE);
    expect(mocks.toast).toHaveBeenCalledWith({ type: "error", body: "Too large to save." });
    expect(mocks.toast).toHaveBeenCalledWith({ type: "error", body: "Only images can be saved." });
    expect(mocks.listLibrary).toHaveBeenCalledWith({ workspaceId: WORKSPACE, offset: 0 });
    expect(result.current.uploadingCount).toBe(0);
  });

  it("refreshes when the window regains focus (shelf saves show up)", async () => {
    setup();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(mocks.listLibrary).toHaveBeenCalledWith({ workspaceId: WORKSPACE, offset: 0 });
  });

  it("saves a note and updates it locally", async () => {
    mocks.updateInspirationNote.mockResolvedValue({ status: "saved", note: "hi" });
    const { result } = setup();
    await act(() => result.current.saveNote(A, " hi "));
    expect(result.current.items.find((entry) => entry.id === A)?.note).toBe("hi");
  });
});
```

`apps/web/src/features/inspiration/components/inspiration-tile.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { InspirationItemView } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspirationTile } from "./inspiration-tile";

afterEach(cleanup);

const ITEM: InspirationItemView = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  imageUrl: "https://signed/a",
  width: 1,
  height: 1,
  mimeType: "image/png",
  sourceUrl: null,
  note: "love this nav",
  captureChannel: "shelf",
  createdAt: "2026-11-06T10:00:00.000Z",
  roomIds: [],
};

describe("InspirationTile", () => {
  it("shows the image with the note as alt text and opens on click", () => {
    const onOpen = vi.fn();
    render(<InspirationTile item={ITEM} isSelected={false} onSelectedChange={vi.fn()} onOpen={onOpen} />);
    expect(screen.getByRole("img", { name: "love this nav" })).toHaveAttribute("src", "https://signed/a");
    fireEvent.click(screen.getByRole("button", { name: "Open love this nav" }));
    expect(onOpen).toHaveBeenCalledWith(ITEM.id);
  });

  it("toggles selection from its checkbox", () => {
    const onSelectedChange = vi.fn();
    render(<InspirationTile item={ITEM} isSelected={false} onSelectedChange={onSelectedChange} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select image" }));
    expect(onSelectedChange).toHaveBeenCalledWith(ITEM.id, true);
  });
});
```

`apps/web/src/features/inspiration/components/inspiration-grid.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { InspirationItemView } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspirationGrid } from "./inspiration-grid";

afterEach(cleanup);

function item(id: string): InspirationItemView {
  return {
    id,
    workspaceId: "22222222-2222-4222-8222-222222222222",
    imageUrl: `https://signed/${id}`,
    width: 1,
    height: 1,
    mimeType: "image/png",
    sourceUrl: null,
    note: null,
    captureChannel: "web",
    createdAt: "2026-11-06T10:00:00.000Z",
    roomIds: [],
  };
}

describe("InspirationGrid", () => {
  it("renders one tile per item plus uploading placeholders first", () => {
    render(
      <InspirationGrid
        items={[item("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"), item("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")]}
        selectedIds={new Set()}
        onSelectedChange={vi.fn()}
        onOpen={vi.fn()}
        uploadingCount={2}
      />,
    );
    expect(screen.getAllByTestId("inspiration-tile")).toHaveLength(2);
    expect(screen.getAllByTestId("inspiration-uploading")).toHaveLength(2);
  });
});
```

`apps/web/src/features/inspiration/components/selection-bar.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionBar } from "./selection-bar";

afterEach(cleanup);

describe("SelectionBar", () => {
  it("shows the count and runs each action", () => {
    const add = vi.fn();
    const clear = vi.fn();
    render(<SelectionBar count={3} actions={[{ label: "Add to room…", variant: "primary", onClick: add }]} onClear={clear} />);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to room…" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(add).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
  });

  it("renders nothing when nothing is selected", () => {
    const { container } = render(<SelectionBar count={0} actions={[]} onClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

`apps/web/src/features/inspiration/components/confirm-delete-dialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

afterEach(cleanup);

describe("ConfirmDeleteDialog", () => {
  it("explains that rooms lose the images too, and confirms", () => {
    const onConfirm = vi.fn();
    render(<ConfirmDeleteDialog isOpen count={2} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    expect(screen.getByText("Delete 2 images?")).toBeInTheDocument();
    expect(screen.getByText("They'll also be removed from any rooms using them.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
```

`apps/web/src/features/inspiration/components/add-to-room-dialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddToRoomDialog } from "./add-to-room-dialog";

afterEach(cleanup);

const ROOMS = [
  { roomId: "33333333-3333-4333-8333-333333333333", roomName: "Login", projectName: "App" },
  { roomId: "44444444-4444-4444-8444-444444444444", roomName: "Pricing", projectName: "Site" },
];

describe("AddToRoomDialog", () => {
  it("confirms with the first room preselected", () => {
    const onConfirm = vi.fn();
    render(<AddToRoomDialog isOpen count={2} rooms={ROOMS} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "Add 2 images" }));
    expect(onConfirm).toHaveBeenCalledWith(ROOMS[0]);
  });

  it("explains when there are no rooms to add to", () => {
    render(<AddToRoomDialog isOpen count={1} rooms={[]} onOpenChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText("You don't have any rooms you can edit yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add 1 image" })).toBeDisabled();
  });
});
```

`apps/web/src/features/inspiration/components/inspiration-detail.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { InspirationItemView } from "@meld/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspirationDetail } from "./inspiration-detail";

afterEach(cleanup);

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ROOM = { roomId: "33333333-3333-4333-8333-333333333333", roomName: "Login", projectName: "App" };
const A: InspirationItemView = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: WORKSPACE,
  imageUrl: "https://signed/a",
  width: 1,
  height: 1,
  mimeType: "image/png",
  sourceUrl: "https://www.pinterest.com/pin/1/",
  note: "nav",
  captureChannel: "shelf",
  createdAt: "2026-11-06T10:00:00.000Z",
  roomIds: [ROOM.roomId],
};
const B: InspirationItemView = { ...A, id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", note: null, sourceUrl: null, roomIds: [] };

function renderDetail(overrides: Partial<Parameters<typeof InspirationDetail>[0]> = {}) {
  const props = {
    workspaceId: WORKSPACE,
    items: [A, B],
    openItemId: A.id,
    rooms: [ROOM],
    onOpenItemChange: vi.fn(),
    onNoteSaved: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
    ...overrides,
  };
  render(<InspirationDetail {...props} />);
  return props;
}

describe("InspirationDetail", () => {
  it("shows the source link and the rooms that use the image", () => {
    renderDetail();
    expect(screen.getByRole("link", { name: /pinterest\.com/ })).toHaveAttribute("href", "https://www.pinterest.com/pin/1/");
    expect(screen.getByRole("link", { name: "App › Login" })).toHaveAttribute(
      "href",
      `/${WORKSPACE}/rooms/${ROOM.roomId}?tab=inspiration`,
    );
  });

  it("saves the edited note", () => {
    const props = renderDetail();
    fireEvent.change(screen.getByRole("textbox", { name: "Note" }), { target: { value: "better" } });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));
    expect(props.onNoteSaved).toHaveBeenCalledWith(A.id, "better");
  });

  it("moves to the next image", () => {
    const props = renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(props.onOpenItemChange).toHaveBeenCalledWith(B.id);
  });

  it("asks before deleting", () => {
    const props = renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Delete image" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith(A.id);
  });
});
```

`apps/web/src/features/inspiration/components/inspiration-library-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ useInspirationLibrary: vi.fn(), listEditableRooms: vi.fn(async () => []) }));
vi.mock("../use-inspiration-library", () => ({ useInspirationLibrary: mocks.useInspirationLibrary }));
vi.mock("../inspiration-reader", () => ({ listEditableRooms: mocks.listEditableRooms }));

import { InspirationLibraryView } from "./inspiration-library-view";

afterEach(cleanup);

const WORKSPACE = "22222222-2222-4222-8222-222222222222";

function hookState(overrides: Record<string, unknown> = {}) {
  return {
    items: [],
    hasMore: false,
    isLoadingMore: false,
    selectedIds: new Set<string>(),
    uploadingCount: 0,
    setSelected: vi.fn(),
    clearSelection: vi.fn(),
    loadMore: vi.fn(),
    uploadFiles: vi.fn(),
    deleteSelected: vi.fn(),
    deleteOne: vi.fn(),
    addSelectedToRoom: vi.fn(),
    saveNote: vi.fn(),
    ...overrides,
  };
}

describe("InspirationLibraryView", () => {
  it("shows the empty state with the shelf hint", () => {
    mocks.useInspirationLibrary.mockReturnValue(hookState());
    render(<InspirationLibraryView workspaceId={WORKSPACE} initialPage={{ items: [], hasMore: false }} initialOpenItemId={null} />);
    expect(screen.getByTestId("inspiration-empty")).toHaveTextContent(
      "Drag images onto the Orion icon in your menu bar, or drop them here.",
    );
  });

  it("shows the count and the grid when there are images", () => {
    mocks.useInspirationLibrary.mockReturnValue(
      hookState({
        items: [
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            workspaceId: WORKSPACE,
            imageUrl: "https://signed/a",
            width: 1,
            height: 1,
            mimeType: "image/png",
            sourceUrl: null,
            note: null,
            captureChannel: "web",
            createdAt: "2026-11-06T10:00:00.000Z",
            roomIds: [],
          },
        ],
      }),
    );
    render(<InspirationLibraryView workspaceId={WORKSPACE} initialPage={{ items: [], hasMore: false }} initialOpenItemId={null} />);
    expect(screen.getByTestId("inspiration-grid")).toBeInTheDocument();
    expect(screen.getByText("1 image")).toBeInTheDocument();
  });
});
```

In `apps/web/src/ui/workspace-navigation.test.tsx`, add one test next to the existing "Design System" link test (copy its render setup exactly):

```tsx
it("links to the Inspiration library", () => {
  // …same render as the Design System link test…
  expect(screen.getByRole("link", { name: "Inspiration" })).toHaveAttribute(
    "href",
    `/${WORKSPACE_ID}/inspiration`,
  );
});
```

(Use whatever workspace-id constant that test file already defines.)

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @meld/web test -- features/inspiration ui/workspace-navigation`
Expected: FAIL (missing modules; no Inspiration link).

- [ ] **Step 3: Implement**

`apps/web/src/features/inspiration/client-image-prep.ts`:

```ts
import { INSPIRATION_LIMITS } from "@meld/contracts";

// Browser-side mirror of the shelf's ImageNormalizer rules (spec B3), so web
// uploads reach the server already in a stored format and within limits.
export type PrepPlan =
  | { kind: "pass" }
  | { kind: "encode"; type: "image/png" | "image/jpeg"; maxEdge: number | null }
  | { kind: "reject"; message: string };

const STORED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const JPEG_QUALITY = 0.85;
const HEIC_MESSAGE = "Drop HEIC photos on the menu-bar shelf instead.";
const NOT_IMAGE_MESSAGE = "Only images can be saved.";
const UNREADABLE_MESSAGE = "That file isn't a readable image.";
const TOO_LARGE_MESSAGE = "Too large to save.";

export function planImagePrep(input: { type: string; size: number; width: number; height: number }): PrepPlan {
  if (HEIC_TYPES.has(input.type)) return { kind: "reject", message: HEIC_MESSAGE };
  if (!input.type.startsWith("image/")) return { kind: "reject", message: NOT_IMAGE_MESSAGE };
  const tooBig =
    Math.max(input.width, input.height) > INSPIRATION_LIMITS.maxEdge || input.size > INSPIRATION_LIMITS.maxBytes;
  if (tooBig) return { kind: "encode", type: "image/jpeg", maxEdge: INSPIRATION_LIMITS.maxEdge };
  if (STORED_TYPES.has(input.type)) return { kind: "pass" };
  return { kind: "encode", type: "image/png", maxEdge: null };
}

async function encode(bitmap: ImageBitmap, type: string, maxEdge: number | null): Promise<Blob | null> {
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, type, JPEG_QUALITY));
}

export async function prepareImageForUpload(file: File): Promise<{ ok: true; blob: Blob } | { ok: false; message: string }> {
  if (HEIC_TYPES.has(file.type)) return { ok: false, message: HEIC_MESSAGE };
  if (!file.type.startsWith("image/")) return { ok: false, message: NOT_IMAGE_MESSAGE };

  let bitmap: ImageBitmap;
  try {
    // For a GIF this decodes the first frame only, which is what we store.
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: UNREADABLE_MESSAGE };
  }
  try {
    const plan = planImagePrep({ type: file.type, size: file.size, width: bitmap.width, height: bitmap.height });
    if (plan.kind === "reject") return { ok: false, message: plan.message };
    if (plan.kind === "pass") return { ok: true, blob: file };

    const first = await encode(bitmap, plan.type, plan.maxEdge);
    if (first && first.size <= INSPIRATION_LIMITS.maxBytes) return { ok: true, blob: first };
    const fallback = await encode(bitmap, "image/jpeg", INSPIRATION_LIMITS.fallbackEdge);
    if (fallback && fallback.size <= INSPIRATION_LIMITS.maxBytes) return { ok: true, blob: fallback };
    return { ok: false, message: TOO_LARGE_MESSAGE };
  } finally {
    bitmap.close();
  }
}
```

`apps/web/src/features/inspiration/use-inspiration-library.ts`:

```ts
"use client";

import { useToast } from "@astryxdesign/core/Toast";
import { SHELF_ERROR_MESSAGES, type InspirationItemView, type ShelfRoom } from "@meld/contracts";
import { useCallback, useEffect, useState } from "react";
import { prepareImageForUpload } from "./client-image-prep";
import {
  deleteInspirationItems,
  linkInspirationToRoom,
  updateInspirationNote,
  uploadInspirationFromWeb,
} from "./inspiration-actions";
import { listLibrary, type LibraryPage } from "./inspiration-reader";

const DELETE_FAILED = "Couldn't delete. Try again.";
const LINK_FAILED = "Couldn't add to the room. Try again.";
const NOTE_FAILED = "Couldn't save the note. Try again.";

function images(count: number): string {
  return count === 1 ? "1 image" : `${count} images`;
}

// A refreshed first page replaces what we had, but anything older the owner
// already paged in stays so "Load more" progress isn't lost.
export function mergeFirstPage(page: LibraryPage, current: InspirationItemView[]): InspirationItemView[] {
  if (!page.hasMore) return page.items;
  const freshIds = new Set(page.items.map((entry) => entry.id));
  const oldestFresh = page.items.at(-1)?.createdAt;
  return [
    ...page.items,
    ...current.filter((entry) => !freshIds.has(entry.id) && oldestFresh !== undefined && entry.createdAt < oldestFresh),
  ];
}

export function useInspirationLibrary({ workspaceId, initialPage }: { workspaceId: string; initialPage: LibraryPage }) {
  const toast = useToast();
  const [items, setItems] = useState(initialPage.items);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [uploadingCount, setUploadingCount] = useState(0);

  const refresh = useCallback(async () => {
    const page = await listLibrary({ workspaceId, offset: 0 });
    setItems((current) => mergeFirstPage(page, current));
    if (!page.hasMore) setHasMore(false);
  }, [workspaceId]);

  useEffect(() => {
    // The shelf saves while the browser is in the background; pick those up on return.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const setSelected = useCallback((itemId: string, isSelected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isSelected) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  async function loadMore() {
    setIsLoadingMore(true);
    try {
      const page = await listLibrary({ workspaceId, offset: items.length });
      setItems((current) => [...current, ...page.items.filter((entry) => !current.some((known) => known.id === entry.id))]);
      setHasMore(page.hasMore);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function uploadFiles(files: File[]) {
    for (const file of files) {
      setUploadingCount((count) => count + 1);
      try {
        const prepared = await prepareImageForUpload(file);
        if (!prepared.ok) {
          toast({ type: "error", body: prepared.message });
          continue;
        }
        const form = new FormData();
        form.set("workspaceId", workspaceId);
        form.set("file", prepared.blob, file.name);
        const result = await uploadInspirationFromWeb(form);
        if (!result.ok) toast({ type: "error", body: SHELF_ERROR_MESSAGES[result.error] });
      } finally {
        setUploadingCount((count) => count - 1);
      }
    }
    await refresh();
  }

  async function deleteItems(itemIds: string[]) {
    const result = await deleteInspirationItems({ itemIds });
    if (result.status === "error") {
      toast({ type: "error", body: DELETE_FAILED });
      return;
    }
    setItems((current) => current.filter((entry) => !itemIds.includes(entry.id)));
    clearSelection();
    toast({ type: "info", body: `Deleted ${images(result.count)}.` });
  }

  async function addSelectedToRoom(room: ShelfRoom) {
    const itemIds = [...selectedIds];
    const result = await linkInspirationToRoom({ roomId: room.roomId, itemIds });
    if (result.status === "error") {
      toast({ type: "error", body: LINK_FAILED });
      return;
    }
    setItems((current) =>
      current.map((entry) =>
        itemIds.includes(entry.id) && !entry.roomIds.includes(room.roomId)
          ? { ...entry, roomIds: [...entry.roomIds, room.roomId] }
          : entry,
      ),
    );
    clearSelection();
    toast({ type: "info", body: `Added ${images(itemIds.length)} to ${room.roomName}.` });
  }

  async function saveNote(itemId: string, note: string) {
    const result = await updateInspirationNote({ itemId, note });
    if (result.status === "error") {
      toast({ type: "error", body: NOTE_FAILED });
      return;
    }
    setItems((current) => current.map((entry) => (entry.id === itemId ? { ...entry, note: result.note } : entry)));
  }

  return {
    items,
    hasMore,
    isLoadingMore,
    selectedIds,
    uploadingCount,
    setSelected,
    clearSelection,
    loadMore,
    uploadFiles,
    deleteSelected: () => deleteItems([...selectedIds]),
    deleteOne: (itemId: string) => deleteItems([itemId]),
    addSelectedToRoom,
    saveNote,
  };
}
```

`apps/web/src/features/inspiration/components/inspiration-tile.tsx`:

```tsx
"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { InspirationItemView } from "@meld/contracts";

const FALLBACK_LABEL = "Inspiration image";

export function InspirationTile({
  item,
  isSelected,
  onSelectedChange,
  onOpen,
}: {
  item: InspirationItemView;
  isSelected: boolean;
  onSelectedChange: (itemId: string, isSelected: boolean) => void;
  onOpen: (itemId: string) => void;
}) {
  const label = item.note ?? FALLBACK_LABEL;
  return (
    <VStack gap={1} data-testid="inspiration-tile">
      <ClickableCard label={`Open ${label}`} onClick={() => onOpen(item.id)} padding={0}>
        <AspectRatio ratio={1} fit="cover">
          {item.imageUrl ? (
            // Signed storage URLs (or data: URLs in the E2E fake): next/image
            // can't optimise either without a remote-pattern allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={label}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <Skeleton width="100%" height="100%" />
          )}
        </AspectRatio>
      </ClickableCard>
      <HStack gap={2} align="center">
        <CheckboxInput
          label="Select image"
          isLabelHidden
          size="sm"
          value={isSelected}
          onChange={(checked) => onSelectedChange(item.id, checked)}
        />
        {item.note ? (
          <Text type="supporting" maxLines={1}>
            {item.note}
          </Text>
        ) : null}
      </HStack>
    </VStack>
  );
}
```

`apps/web/src/features/inspiration/components/inspiration-grid.tsx`:

```tsx
"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Grid } from "@astryxdesign/core/Grid";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import type { InspirationItemView } from "@meld/contracts";
import { InspirationTile } from "./inspiration-tile";

const TILE_MIN_WIDTH = 200;

export function InspirationGrid({
  items,
  selectedIds,
  onSelectedChange,
  onOpen,
  uploadingCount = 0,
}: {
  items: InspirationItemView[];
  selectedIds: ReadonlySet<string>;
  onSelectedChange: (itemId: string, isSelected: boolean) => void;
  onOpen: (itemId: string) => void;
  uploadingCount?: number;
}) {
  return (
    <Grid gap={4} columns={{ minWidth: TILE_MIN_WIDTH, repeat: "fill" }} data-testid="inspiration-grid">
      {Array.from({ length: uploadingCount }, (_, index) => (
        <AspectRatio key={`uploading-${index}`} ratio={1} data-testid="inspiration-uploading">
          <Skeleton width="100%" height="100%" />
        </AspectRatio>
      ))}
      {items.map((item) => (
        <InspirationTile
          key={item.id}
          item={item}
          isSelected={selectedIds.has(item.id)}
          onSelectedChange={onSelectedChange}
          onOpen={onOpen}
        />
      ))}
    </Grid>
  );
}
```

(`TILE_MIN_WIDTH` is a `Grid` prop in component units, not a CSS px literal, so `check:astryx` accepts it. If `Grid` or `AspectRatio` rejects `data-testid`, wrap the element in a `VStack` that carries the test id.)

`apps/web/src/features/inspiration/components/selection-bar.tsx`:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";

export type SelectionAction = {
  label: string;
  variant?: "primary" | "secondary" | "destructive";
  onClick: () => void;
};

export function SelectionBar({
  count,
  actions,
  onClear,
}: {
  count: number;
  actions: SelectionAction[];
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <HStack gap={2} align="center" data-testid="inspiration-selection-bar">
      <Text type="label">{`${count} selected`}</Text>
      {actions.map((action) => (
        <Button key={action.label} label={action.label} variant={action.variant ?? "secondary"} size="sm" onClick={action.onClick} />
      ))}
      <Button label="Clear" variant="ghost" size="sm" onClick={onClear} />
    </HStack>
  );
}
```

`apps/web/src/features/inspiration/components/confirm-delete-dialog.tsx`:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

export function ConfirmDeleteDialog({
  isOpen,
  count,
  onOpenChange,
  onConfirm,
  title = count === 1 ? "Delete 1 image?" : `Delete ${count} images?`,
  description = "They'll also be removed from any rooms using them.",
  confirmLabel = "Delete",
}: {
  isOpen: boolean;
  count: number;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="required" width="calc(var(--spacing-12) * 8)">
      <Layout
        header={<DialogHeader title={title} onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <Text>{description}</Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} justify="end">
              <Button label="Cancel" variant="secondary" onClick={() => onOpenChange(false)} />
              <Button
                label={confirmLabel}
                variant="destructive"
                onClick={() => {
                  onConfirm();
                  onOpenChange(false);
                }}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
```

`apps/web/src/features/inspiration/components/add-to-room-dialog.tsx`:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ShelfRoom } from "@meld/contracts";
import { useState } from "react";

export function roomLabel(room: ShelfRoom): string {
  return `${room.projectName} › ${room.roomName}`;
}

export function AddToRoomDialog({
  isOpen,
  count,
  rooms,
  onOpenChange,
  onConfirm,
}: {
  isOpen: boolean;
  count: number;
  rooms: ShelfRoom[];
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (room: ShelfRoom) => void;
}) {
  const [roomId, setRoomId] = useState<string | undefined>(undefined);
  const selected = rooms.find((room) => room.roomId === roomId) ?? rooms[0];
  const confirmLabel = count === 1 ? "Add 1 image" : `Add ${count} images`;

  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width="calc(var(--spacing-12) * 9)">
      <Layout
        header={<DialogHeader title="Add to room" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            <VStack gap={3}>
              {rooms.length === 0 ? (
                <Text type="supporting">You don&apos;t have any rooms you can edit yet.</Text>
              ) : (
                <Selector
                  label="Room"
                  hasSearch
                  options={rooms.map((room) => ({ value: room.roomId, label: roomLabel(room) }))}
                  value={selected?.roomId}
                  onChange={setRoomId}
                />
              )}
            </VStack>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} justify="end">
              <Button label="Cancel" variant="secondary" onClick={() => onOpenChange(false)} />
              <Button
                label={confirmLabel}
                variant="primary"
                isDisabled={!selected}
                onClick={() => {
                  if (!selected) return;
                  onConfirm(selected);
                  onOpenChange(false);
                }}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
```

`apps/web/src/features/inspiration/components/inspiration-detail.tsx`:

```tsx
"use client";

import { AspectRatio } from "@astryxdesign/core/AspectRatio";
import { Button } from "@astryxdesign/core/Button";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Lightbox } from "@astryxdesign/core/Lightbox";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { VStack } from "@astryxdesign/core/VStack";
import type { InspirationItemView, ShelfRoom } from "@meld/contracts";
import { useState } from "react";
import { roomLabel } from "./add-to-room-dialog";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

export function InspirationDetail({
  workspaceId,
  items,
  openItemId,
  rooms,
  onOpenItemChange,
  onNoteSaved,
  onDelete,
}: {
  workspaceId: string;
  items: InspirationItemView[];
  openItemId: string | null;
  rooms: ShelfRoom[];
  onOpenItemChange: (itemId: string | null) => void;
  onNoteSaved: (itemId: string, note: string) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
}) {
  const index = items.findIndex((item) => item.id === openItemId);
  const item = index >= 0 ? items[index] : undefined;
  const [draftNote, setDraftNote] = useState<{ itemId: string; value: string } | null>(null);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  if (!item) return null;

  const note = draftNote?.itemId === item.id ? draftNote.value : (item.note ?? "");
  const usedIn = rooms.filter((room) => item.roomIds.includes(room.roomId));
  const previous = items[index - 1];
  const next = items[index + 1];
  const close = (isOpen: boolean) => {
    if (!isOpen) onOpenItemChange(null);
  };

  return (
    <Dialog isOpen onOpenChange={close} width="calc(var(--spacing-12) * 20)" maxHeight="90vh">
      <Layout
        header={<DialogHeader title="Inspiration" onOpenChange={close} />}
        content={
          <LayoutContent>
            <HStack gap={6} data-testid="inspiration-detail">
              <VStack gap={2} width="60%">
                <ClickableCard label="Zoom image" onClick={() => setIsZoomed(true)} padding={0}>
                  <AspectRatio ratio={item.width / item.height} fit="contain">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                    <img
                      src={item.imageUrl ?? ""}
                      alt={item.note ?? "Inspiration image"}
                      style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                    />
                  </AspectRatio>
                </ClickableCard>
                <HStack gap={2} justify="between">
                  <Button label="Previous image" variant="ghost" size="sm" isDisabled={!previous} onClick={() => previous && onOpenItemChange(previous.id)} />
                  <Button label="Next image" variant="ghost" size="sm" isDisabled={!next} onClick={() => next && onOpenItemChange(next.id)} />
                </HStack>
              </VStack>
              <VStack gap={4} width="40%">
                <TextArea label="Note" value={note} onChange={(value) => setDraftNote({ itemId: item.id, value })} />
                <Button label="Save note" variant="secondary" size="sm" onClick={() => void onNoteSaved(item.id, note)} />
                {item.sourceUrl ? (
                  <VStack gap={1}>
                    <Text type="label">Source</Text>
                    <Link href={item.sourceUrl} isExternalLink>
                      {new URL(item.sourceUrl).hostname}
                    </Link>
                  </VStack>
                ) : null}
                <VStack gap={1}>
                  <Text type="label">Saved</Text>
                  <Text type="supporting">{new Date(item.createdAt).toLocaleDateString()}</Text>
                </VStack>
                <VStack gap={1}>
                  <Text type="label">Used in</Text>
                  {usedIn.length === 0 ? (
                    <Text type="supporting">No rooms yet</Text>
                  ) : (
                    usedIn.map((room) => (
                      <Link key={room.roomId} href={`/${workspaceId}/rooms/${room.roomId}?tab=inspiration`}>
                        {roomLabel(room)}
                      </Link>
                    ))
                  )}
                </VStack>
                <Button label="Delete image" variant="destructive" size="sm" onClick={() => setIsConfirmingDelete(true)} />
              </VStack>
            </HStack>
            <Lightbox
              isOpen={isZoomed}
              onOpenChange={setIsZoomed}
              hasZoom
              media={{ src: item.imageUrl ?? "", alt: item.note ?? "Inspiration image" }}
            />
            <ConfirmDeleteDialog
              isOpen={isConfirmingDelete}
              count={1}
              onOpenChange={setIsConfirmingDelete}
              onConfirm={() => {
                void onDelete(item.id);
                onOpenItemChange(null);
              }}
            />
          </LayoutContent>
        }
      />
    </Dialog>
  );
}
```

(If `check:astryx` flags the `60%`/`40%` widths, replace them with `width="fill"` on the details column and a fixed `calc(var(--spacing-12) * 12)` on the image column.)

`apps/web/src/features/inspiration/components/inspiration-library-view.tsx`:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ShelfRoom } from "@meld/contracts";
import { useEffect, useState } from "react";
import { listEditableRooms, type LibraryPage } from "../inspiration-reader";
import { useInspirationLibrary } from "../use-inspiration-library";
import { AddToRoomDialog } from "./add-to-room-dialog";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";
import { InspirationDetail } from "./inspiration-detail";
import { InspirationGrid } from "./inspiration-grid";
import { SelectionBar } from "./selection-bar";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif";
const EMPTY_HINT = "Drag images onto the Orion icon in your menu bar, or drop them here.";

function filesFrom(value: File | File[] | null): File[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function InspirationLibraryView({
  workspaceId,
  initialPage,
  initialOpenItemId,
}: {
  workspaceId: string;
  initialPage: LibraryPage;
  initialOpenItemId: string | null;
}) {
  const library = useInspirationLibrary({ workspaceId, initialPage });
  const [rooms, setRooms] = useState<ShelfRoom[]>([]);
  const [openItemId, setOpenItemId] = useState(initialOpenItemId);
  const [isAddingToRoom, setIsAddingToRoom] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const { uploadFiles } = library;

  useEffect(() => {
    void listEditableRooms(workspaceId).then(setRooms);
  }, [workspaceId]);

  useEffect(() => {
    // ⌘V anywhere on the page saves a copied image.
    const onPaste = (event: ClipboardEvent) => {
      const pasted = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
      if (pasted.length > 0) void uploadFiles(pasted);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadFiles]);

  const count = library.items.length;
  const isEmpty = count === 0 && library.uploadingCount === 0;

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <VStack gap={3} paddingInline={6} paddingBlock={4}>
            <HStack gap={2} align="center">
              <Heading level={1}>Inspiration</Heading>
              {count > 0 ? <Text type="supporting">{count === 1 ? "1 image" : `${count} images`}</Text> : null}
            </HStack>
            <FileInput
              label="Add images"
              isLabelHidden
              mode="dropzone"
              isMultiple
              accept={ACCEPT}
              value={[]}
              onChange={(files) => void library.uploadFiles(filesFrom(files))}
              placeholder="Drop images here or click to choose"
              height="auto"
            />
            <SelectionBar
              count={library.selectedIds.size}
              onClear={library.clearSelection}
              actions={[
                { label: "Add to room…", variant: "primary", onClick: () => setIsAddingToRoom(true) },
                { label: "Delete", variant: "destructive", onClick: () => setIsConfirmingDelete(true) },
              ]}
            />
          </VStack>
        </LayoutHeader>
      }
    >
      <LayoutContent padding={6}>
        {isEmpty ? (
          <VStack data-testid="inspiration-empty">
            <EmptyState title="Nothing here yet." description={EMPTY_HINT} />
          </VStack>
        ) : (
          <VStack gap={4}>
            <InspirationGrid
              items={library.items}
              selectedIds={library.selectedIds}
              onSelectedChange={library.setSelected}
              onOpen={setOpenItemId}
              uploadingCount={library.uploadingCount}
            />
            {library.hasMore ? (
              <HStack justify="center">
                <Button label="Load more" variant="secondary" isLoading={library.isLoadingMore} onClick={() => void library.loadMore()} />
              </HStack>
            ) : null}
          </VStack>
        )}
      </LayoutContent>
      <InspirationDetail
        workspaceId={workspaceId}
        items={library.items}
        openItemId={openItemId}
        rooms={rooms}
        onOpenItemChange={setOpenItemId}
        onNoteSaved={library.saveNote}
        onDelete={library.deleteOne}
      />
      <AddToRoomDialog
        isOpen={isAddingToRoom}
        count={library.selectedIds.size}
        rooms={rooms}
        onOpenChange={setIsAddingToRoom}
        onConfirm={(room) => void library.addSelectedToRoom(room)}
      />
      <ConfirmDeleteDialog
        isOpen={isConfirmingDelete}
        count={library.selectedIds.size}
        onOpenChange={setIsConfirmingDelete}
        onConfirm={() => void library.deleteSelected()}
      />
    </Layout>
  );
}
```

`uploadFiles` is recreated on every render, so the paste listener re-binds each render. That's harmless, but if a reviewer flags it, wrap `uploadFiles` in `useCallback` inside the hook with `[workspaceId, refresh, toast]`.

`apps/web/src/app/(app)/[workspaceId]/inspiration/page.tsx`:

```tsx
import { InspirationLibraryView } from "@/features/inspiration/components/inspiration-library-view";
import { listLibrary } from "@/features/inspiration/inspiration-reader";

export default async function InspirationPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ item?: string | string[] }>;
}) {
  const { workspaceId } = await params;
  const { item } = await searchParams;
  const initialPage = await listLibrary({ workspaceId, offset: 0 });
  // `?item=<id>` (sent by the shelf's recent thumbnails) opens that image.
  const initialOpenItemId = typeof item === "string" ? item : null;

  return (
    <InspirationLibraryView workspaceId={workspaceId} initialPage={initialPage} initialOpenItemId={initialOpenItemId} />
  );
}
```

`apps/web/src/ui/workspace-navigation.tsx`: add `PixelLightBulb as LightBulb,` to the `@/ui/pixel-icons` import, add `const inspirationPath = \`/${workspaceId}/inspiration\`;` next to `designSystemPath`, and insert this item **between "Mentions" and "Design System"**:

```tsx
          <SideNavItem
            label="Inspiration"
            icon={LightBulb}
            selectedIcon={LightBulb}
            href={inspirationPath}
            isSelected={pathname.startsWith(inspirationPath)}
          />
```

- [ ] **Step 4: Run the tests and checks**

Run: `pnpm --filter @meld/web test -- features/inspiration ui/workspace-navigation && pnpm --filter @meld/web typecheck && pnpm check:astryx && pnpm lint`
Expected: all PASS / exit 0. If `check:astryx` reports anything, fix it using component props or tokens, never by disabling the check.

- [ ] **Step 5: See it in the browser**

Start your own web server on a spare port (`PORT=3001 pnpm --filter web dev`), sign in, and open `http://127.0.0.1:3001/<workspaceId>/inspiration`. Drop two images, select one, choose Add to room…, open the detail view, edit the note, then delete it. Save a screenshot to `.context/inspiration-library.png`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/inspiration apps/web/src/app/\(app\)/\[workspaceId\]/inspiration apps/web/src/ui/workspace-navigation.tsx apps/web/src/ui/workspace-navigation.test.tsx
git commit -m "feat(inspiration): Library page with upload, selection, detail, and add-to-room"
```

---
### Task 10: Room Inspiration tab

**Read first:** `apps/web/src/features/rooms/surfaces.ts` and its test, `apps/web/src/features/rooms/components/room-tab-strip.tsx` and its test, the room page `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`, and `apps/web/src/features/rooms/supabase-backend.ts` lines 320–465 (where `surfaceState` is built).

**Files:**
- Modify: `apps/web/src/features/rooms/surfaces.ts` + `surfaces.test.ts`
- Modify: `apps/web/src/features/rooms/room-tabs.ts` (+ its test, if it asserts the label map)
- Modify: `apps/web/src/features/rooms/components/room-tab-strip.tsx` + `room-tab-strip.test.tsx`
- Modify: `apps/web/src/features/rooms/supabase-backend.ts` (one count query)
- Modify: `apps/web/src/features/rooms/fake-backend.ts` and `apps/web/src/features/rooms/e2e-fake.ts` (wherever a `RoomSurfaceState` literal is built)
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`
- Create: `apps/web/src/features/inspiration/components/library-picker-dialog.tsx` (+ `.test.tsx`)
- Create: `apps/web/src/features/inspiration/components/room-inspiration-surface.tsx` (+ `.test.tsx`)

**Interfaces:**
- Consumes: Task 8 (`listRoomInspiration`, `listLibrary`, `listEditableRooms`, `linkInspirationToRoom`, `unlinkInspirationFromRoom`, `updateInspirationNote`, `deleteInspirationItems`, `fakeRoomHasInspiration`); Task 9 (`InspirationGrid`, `InspirationDetail`, `SelectionBar`).
- Produces: `RoomSurface` gains `"inspiration"`; `RoomSurfaceState` gains `hasInspiration: boolean`; `ROOM_SURFACE_LABELS.inspiration = "Inspiration"`; `RoomInspirationSurface({ workspaceId, roomId, items, canEdit })`; `LibraryPickerDialog({ isOpen, workspaceId, excludeIds, onOpenChange, onConfirm })`.

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/features/rooms/surfaces.test.ts`, add `hasInspiration: false,` to **every** existing state fixture (TypeScript will flag any you miss), then add:

```ts
describe("inspiration surface", () => {
  const base = {
    hasUserFlow: false,
    hasPrd: false,
    hasPrdTask: false,
    hasBuiltDesignScreen: false,
    decisionCount: 0,
    stage: "discovery" as const,
    hasInspiration: false,
  };

  it("emerges only once the room has a linked image", () => {
    expect(getRoomSurfaces(base)).toEqual(["conversation"]);
    expect(getRoomSurfaces({ ...base, hasInspiration: true })).toEqual(["conversation", "inspiration"]);
  });

  it("sits after prototype and counts toward the overview rule", () => {
    expect(getRoomSurfaces({ ...base, hasPrd: true, hasBuiltDesignScreen: true, hasInspiration: true })).toEqual([
      "conversation",
      "prd",
      "prototype",
      "inspiration",
      "overview",
    ]);
    expect(getRoomSurfaces({ ...base, hasPrd: true, hasInspiration: true })).toEqual([
      "conversation",
      "prd",
      "inspiration",
      "overview",
    ]);
  });
});
```

In `apps/web/src/features/rooms/components/room-tab-strip.test.tsx`, add `hasInspiration: false` to the existing fixtures and one test (copy the file's existing render helper):

```tsx
it("shows the Inspiration tab when the room has inspiration", () => {
  // …existing render helper with surfaceState { …, hasPrd: true, hasInspiration: true }…
  expect(screen.getByRole("tab", { name: /Inspiration/ })).toHaveAttribute(
    "href",
    expect.stringContaining("?tab=inspiration"),
  );
});
```

(If the existing tests locate tabs by `link` rather than `tab`, use the same role they use.)

`apps/web/src/features/inspiration/components/library-picker-dialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listLibrary: vi.fn() }));
vi.mock("../inspiration-reader", () => ({ listLibrary: mocks.listLibrary }));

import { LibraryPickerDialog } from "./library-picker-dialog";

afterEach(cleanup);

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function item(id: string) {
  return {
    id,
    workspaceId: WORKSPACE,
    imageUrl: `https://signed/${id}`,
    width: 1,
    height: 1,
    mimeType: "image/png" as const,
    sourceUrl: null,
    note: null,
    captureChannel: "web" as const,
    createdAt: "2026-11-06T10:00:00.000Z",
    roomIds: [],
  };
}

describe("LibraryPickerDialog", () => {
  it("lists library images not already in the room and confirms the picked ones", async () => {
    mocks.listLibrary.mockResolvedValue({ items: [item(A), item(B)], hasMore: false });
    const onConfirm = vi.fn();
    render(<LibraryPickerDialog isOpen workspaceId={WORKSPACE} excludeIds={[B]} onOpenChange={vi.fn()} onConfirm={onConfirm} />);
    await waitFor(() => expect(screen.getAllByTestId("inspiration-tile")).toHaveLength(1));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select image" }));
    fireEvent.click(screen.getByRole("button", { name: "Add 1 image" }));
    expect(onConfirm).toHaveBeenCalledWith([A]);
  });
});
```

`apps/web/src/features/inspiration/components/room-inspiration-surface.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  toast: vi.fn(),
  unlinkInspirationFromRoom: vi.fn(),
  linkInspirationToRoom: vi.fn(),
  updateInspirationNote: vi.fn(),
  deleteInspirationItems: vi.fn(),
  listEditableRooms: vi.fn(async () => []),
  listLibrary: vi.fn(async () => ({ items: [], hasMore: false })),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("../inspiration-actions", () => ({
  unlinkInspirationFromRoom: mocks.unlinkInspirationFromRoom,
  linkInspirationToRoom: mocks.linkInspirationToRoom,
  updateInspirationNote: mocks.updateInspirationNote,
  deleteInspirationItems: mocks.deleteInspirationItems,
}));
vi.mock("../inspiration-reader", () => ({ listEditableRooms: mocks.listEditableRooms, listLibrary: mocks.listLibrary }));

import { RoomInspirationSurface } from "./room-inspiration-surface";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ROOM = "33333333-3333-4333-8333-333333333333";
const A = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  workspaceId: WORKSPACE,
  imageUrl: "https://signed/a",
  width: 1,
  height: 1,
  mimeType: "image/png" as const,
  sourceUrl: null,
  note: null,
  captureChannel: "web" as const,
  createdAt: "2026-11-06T10:00:00.000Z",
  roomIds: [ROOM],
};

describe("RoomInspirationSurface", () => {
  it("removes selected images from the room only, then refreshes", async () => {
    mocks.unlinkInspirationFromRoom.mockResolvedValue({ status: "unlinked", count: 1 });
    render(<RoomInspirationSurface workspaceId={WORKSPACE} roomId={ROOM} items={[A]} canEdit />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select image" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from room" }));
    await waitFor(() => expect(mocks.unlinkInspirationFromRoom).toHaveBeenCalledWith({ roomId: ROOM, itemIds: [A.id] }));
    expect(mocks.deleteInspirationItems).not.toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("hides editing controls from view-only participants", () => {
    render(<RoomInspirationSurface workspaceId={WORKSPACE} roomId={ROOM} items={[A]} canEdit={false} />);
    expect(screen.queryByRole("button", { name: "Add from library" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Select image" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @meld/web test -- surfaces room-tab-strip library-picker room-inspiration`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/features/rooms/surfaces.ts`: add `| "inspiration"` to `RoomSurface`, add `hasInspiration: boolean;` to `RoomSurfaceState`, and in `getRoomSurfaces` push it right after the prototype block:

```ts
  if (state.hasInspiration) artifacts.push("inspiration");
```

`apps/web/src/features/rooms/room-tabs.ts`: add `inspiration: "Inspiration",` to `ROOM_SURFACE_LABELS` (after `prototype`).

`apps/web/src/features/rooms/components/room-tab-strip.tsx`: add `PixelLightBulb as LightBulb,` to the pixel-icons import, then after the prototype `Tab` block:

```tsx
      {surfaces.includes("inspiration") ? (
        <Tab
          value="inspiration"
          label={ROOM_SURFACE_LABELS.inspiration}
          href={`${basePath}?tab=inspiration`}
          icon={<LightBulb pack="basic" size="sm" />}
          selectedIcon={<LightBulb pack="filled" size="sm" />}
        />
      ) : null}
```

`apps/web/src/features/rooms/supabase-backend.ts`: add one more entry at the **end** of the `Promise.all` array (and a matching `roomInspirationCountResult` at the end of its destructuring list):

```ts
        // Any linked inspiration image makes the Inspiration tab emerge.
        supabase
          .from("room_inspiration")
          .select("item_id", { count: "exact", head: true })
          .eq("room_id", input.roomId),
```

Add `roomInspirationCountResult.error ||` to the error check, and `hasInspiration: (roomInspirationCountResult.count ?? 0) > 0,` to `surfaceState`.

`apps/web/src/features/rooms/fake-backend.ts` (and any other `RoomSurfaceState` literal that `pnpm --filter @meld/web typecheck` reports, such as in `e2e-fake.ts`): add `hasInspiration: fakeRoomHasInspiration(input.roomId),` with `import { fakeRoomHasInspiration } from "@/features/inspiration/inspiration-fake";`. Where the literal has no room id in scope, use `false` and add a one-line comment saying why.

`apps/web/src/features/inspiration/components/library-picker-dialog.tsx`:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import type { InspirationItemView } from "@meld/contracts";
import { useEffect, useState } from "react";
import { listLibrary } from "../inspiration-reader";
import { InspirationGrid } from "./inspiration-grid";

export function LibraryPickerDialog({
  isOpen,
  workspaceId,
  excludeIds,
  onOpenChange,
  onConfirm,
}: {
  isOpen: boolean;
  workspaceId: string;
  excludeIds: string[];
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (itemIds: string[]) => void;
}) {
  const [items, setItems] = useState<InspirationItemView[]>([]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set());
    void listLibrary({ workspaceId, offset: 0 }).then((page) =>
      setItems(page.items.filter((item) => !excludeIds.includes(item.id))),
    );
  }, [isOpen, workspaceId, excludeIds]);

  function setSelected(itemId: string, isSelected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isSelected) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  const count = selectedIds.size;
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange} purpose="form" width="calc(var(--spacing-12) * 18)" maxHeight="85vh">
      <Layout
        header={<DialogHeader title="Add from library" onOpenChange={onOpenChange} />}
        content={
          <LayoutContent>
            {items.length === 0 ? (
              <Text type="supporting">Everything in your library is already in this room.</Text>
            ) : (
              <InspirationGrid
                items={items}
                selectedIds={selectedIds}
                onSelectedChange={setSelected}
                onOpen={(itemId) => setSelected(itemId, !selectedIds.has(itemId))}
              />
            )}
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <HStack gap={2} justify="end">
              <Button label="Cancel" variant="secondary" onClick={() => onOpenChange(false)} />
              <Button
                label={count === 1 ? "Add 1 image" : `Add ${count} images`}
                variant="primary"
                isDisabled={count === 0}
                onClick={() => {
                  onConfirm([...selectedIds]);
                  onOpenChange(false);
                }}
              />
            </HStack>
          </LayoutFooter>
        }
      />
    </Dialog>
  );
}
```

`apps/web/src/features/inspiration/components/room-inspiration-surface.tsx`:

```tsx
"use client";

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import type { InspirationItemView, ShelfRoom } from "@meld/contracts";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  deleteInspirationItems,
  linkInspirationToRoom,
  unlinkInspirationFromRoom,
  updateInspirationNote,
} from "../inspiration-actions";
import { listEditableRooms } from "../inspiration-reader";
import { InspirationDetail } from "./inspiration-detail";
import { InspirationGrid } from "./inspiration-grid";
import { LibraryPickerDialog } from "./library-picker-dialog";
import { SelectionBar } from "./selection-bar";

const ACTION_FAILED = "That didn't work. Try again.";
const NO_SELECTION: ReadonlySet<string> = new Set();

export function RoomInspirationSurface({
  workspaceId,
  roomId,
  items,
  canEdit,
}: {
  workspaceId: string;
  roomId: string;
  items: InspirationItemView[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(NO_SELECTION);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [rooms, setRooms] = useState<ShelfRoom[]>([]);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);

  useEffect(() => {
    void listEditableRooms(workspaceId).then(setRooms);
  }, [workspaceId]);

  async function run(action: () => Promise<{ status: string }>) {
    const result = await action();
    if (result.status === "error") toast({ type: "error", body: ACTION_FAILED });
    setSelectedIds(NO_SELECTION);
    router.refresh();
  }

  function setSelected(itemId: string, isSelected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isSelected) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  return (
    <VStack gap={4} padding={6} data-testid="room-inspiration">
      {canEdit ? (
        <HStack gap={2} align="center" justify="between">
          <SelectionBar
            count={selectedIds.size}
            onClear={() => setSelectedIds(NO_SELECTION)}
            actions={[
              {
                label: "Remove from room",
                onClick: () => void run(() => unlinkInspirationFromRoom({ roomId, itemIds: [...selectedIds] })),
              },
            ]}
          />
          <Button label="Add from library" variant="secondary" size="sm" onClick={() => setIsPicking(true)} />
        </HStack>
      ) : null}
      <InspirationGrid
        items={items}
        selectedIds={canEdit ? selectedIds : NO_SELECTION}
        onSelectedChange={canEdit ? setSelected : () => undefined}
        onOpen={setOpenItemId}
        hideSelection={!canEdit}
      />
      <InspirationDetail
        workspaceId={workspaceId}
        items={items}
        openItemId={openItemId}
        rooms={rooms}
        onOpenItemChange={setOpenItemId}
        onNoteSaved={(itemId, note) => run(() => updateInspirationNote({ itemId, note }))}
        onDelete={(itemId) => run(() => deleteInspirationItems({ itemIds: [itemId] }))}
      />
      {canEdit ? (
        <LibraryPickerDialog
          isOpen={isPicking}
          workspaceId={workspaceId}
          excludeIds={itemIds}
          onOpenChange={setIsPicking}
          onConfirm={(picked) => void run(() => linkInspirationToRoom({ roomId, itemIds: picked }))}
        />
      ) : null}
    </VStack>
  );
}
```

This uses a new optional `hideSelection?: boolean` prop. Add it to `InspirationGrid` (pass it through) and `InspirationTile` (when true, don't render the `CheckboxInput`), and add one test to `inspiration-tile.test.tsx`:

```tsx
it("has no checkbox when selection is hidden", () => {
  render(<InspirationTile item={ITEM} isSelected={false} onSelectedChange={vi.fn()} onOpen={vi.fn()} hideSelection />);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});
```

Room page (`apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`):
1. Import `listRoomInspiration` from `@/features/inspiration/inspiration-reader` and `RoomInspirationSurface` from `@/features/inspiration/components/room-inspiration-surface`.
2. Add `roomInspiration,` as the last name in the `Promise.all` destructuring and this as the last array entry:

```ts
    activeSurface === "inspiration"
      ? listRoomInspiration(roomId)
      : Promise.resolve([]),
```

3. In the surface switch, add a branch before the `overview` branch:

```tsx
            ) : activeSurface === "inspiration" ? (
              <RoomInspirationSurface
                workspaceId={workspaceId}
                roomId={roomId}
                items={roomInspiration}
                canEdit={canEdit}
              />
```

- [ ] **Step 4: Run the tests and checks**

Run: `pnpm --filter @meld/web test && pnpm --filter @meld/web typecheck && pnpm check:astryx && pnpm lint`
Expected: PASS / exit 0. The full web suite runs because the `RoomSurfaceState` change touches many tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/rooms apps/web/src/features/inspiration apps/web/src/app/\(app\)/\[workspaceId\]/rooms
git commit -m "feat(rooms): Inspiration tab emerges when a room has linked images"
```

---
### Task 11: Settings → Shelf page

**Read first:** `apps/web/src/features/ai/components/device-list.tsx` (Table + Timestamp + revoke-dialog pattern) and `apps/web/src/app/(app)/[workspaceId]/settings/devices/page.tsx` (settings page frame).

**Files:**
- Create: `apps/web/src/features/inspiration/components/shelf-settings-view.tsx` (+ `.test.tsx`)
- Create: `apps/web/src/app/(app)/[workspaceId]/settings/shelf/page.tsx`
- Modify: `apps/web/src/features/workspaces/settings-tabs.tsx` + `settings-tabs.test.tsx`

**Interfaces:**
- Consumes: Task 8 `createShelfConnectCode`, `listShelfTokens`, `revokeShelfToken`, `ShelfTokenView`; Task 9 `ConfirmDeleteDialog`.
- Produces: `ShelfSettingsView({ workspaceId, initialTokens })`; route `/[workspaceId]/settings/shelf`; a third settings tab, "Shelf".

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/inspiration/components/shelf-settings-view.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createShelfConnectCode: vi.fn(),
  listShelfTokens: vi.fn(async () => []),
  revokeShelfToken: vi.fn(),
}));
vi.mock("../shelf-connection", () => mocks);

import { ShelfSettingsView } from "./shelf-settings-view";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => vi.clearAllMocks());

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const TOKEN = { id: "11111111-1111-4111-8111-111111111111", deviceName: "Studio Mac", createdAt: "2026-11-06T10:00:00.000Z", lastUsedAt: null };

describe("ShelfSettingsView", () => {
  it("shows a one-time code with a countdown", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-06T10:00:00.000Z") });
    mocks.createShelfConnectCode.mockResolvedValue({ status: "created", code: "ABCD1234", expiresAt: "2026-11-06T10:10:00.000Z" });
    render(<ShelfSettingsView workspaceId={WORKSPACE} initialTokens={[]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect shelf" }));
    });
    expect(screen.getByText("ABCD1234")).toBeInTheDocument();
    expect(screen.getByText("Expires in 10:00")).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    expect(screen.getByText("Expires in 8:59")).toBeInTheDocument();
  });

  it("shows the server's message when a code can't be made", async () => {
    mocks.createShelfConnectCode.mockResolvedValue({ status: "error", message: "Use the code already on screen before making another one." });
    render(<ShelfSettingsView workspaceId={WORKSPACE} initialTokens={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect shelf" }));
    expect(await screen.findByText("Use the code already on screen before making another one.")).toBeInTheDocument();
  });

  it("lists the connected shelf and disconnects it after confirming", async () => {
    mocks.revokeShelfToken.mockResolvedValue({ status: "revoked" });
    render(<ShelfSettingsView workspaceId={WORKSPACE} initialTokens={[TOKEN]} />);
    expect(screen.getByText("Studio Mac")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect shelf" }));
    await waitFor(() => expect(mocks.revokeShelfToken).toHaveBeenCalledWith(TOKEN.id));
    expect(mocks.listShelfTokens).toHaveBeenCalledWith(WORKSPACE);
  });
});
```

In `apps/web/src/features/workspaces/settings-tabs.test.tsx`, add a test asserting a `Shelf` tab linking to `/${workspaceId}/settings/shelf`, and that it is selected when `usePathname` returns that path. Copy the file's existing `usePathname` mock setup.

- [ ] **Step 2: Run them and confirm they fail**

Run: `pnpm --filter @meld/web test -- shelf-settings settings-tabs`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/features/inspiration/components/shelf-settings-view.tsx`:

```tsx
"use client";

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { proportional, Table, type TableColumn } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useState } from "react";
import type { ShelfTokenView } from "../inspiration-shared";
import { createShelfConnectCode, listShelfTokens, revokeShelfToken } from "../shelf-connection";
import { ConfirmDeleteDialog } from "./confirm-delete-dialog";

const ONE_SECOND_MS = 1000;
const SECONDS_PER_MINUTE = 60;

function remaining(expiresAt: string, now: number): string {
  const seconds = Math.max(0, Math.round((Date.parse(expiresAt) - now) / ONE_SECOND_MS));
  return `${Math.floor(seconds / SECONDS_PER_MINUTE)}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, "0")}`;
}

export function ShelfSettingsView({ workspaceId, initialTokens }: { workspaceId: string; initialTokens: ShelfTokenView[] }) {
  const [tokens, setTokens] = useState(initialTokens);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [revoking, setRevoking] = useState<ShelfTokenView | null>(null);

  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(() => setNow(Date.now()), ONE_SECOND_MS);
    return () => window.clearInterval(timer);
  }, [code]);

  async function handleConnect() {
    setError(null);
    const result = await createShelfConnectCode(workspaceId);
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    setNow(Date.now());
    setCode({ code: result.code, expiresAt: result.expiresAt });
  }

  async function handleDisconnect(token: ShelfTokenView) {
    const result = await revokeShelfToken(token.id);
    if (result.status === "error") setError("Couldn't disconnect. Try again.");
    setTokens(await listShelfTokens(workspaceId));
  }

  const isExpired = code !== null && Date.parse(code.expiresAt) <= now;
  const columns: TableColumn<ShelfTokenView>[] = [
    { key: "deviceName", header: "Shelf", width: proportional(2), renderCell: (token) => <Text weight="semibold">{token.deviceName}</Text> },
    { key: "createdAt", header: "Connected", width: proportional(1), renderCell: (token) => <Timestamp value={token.createdAt} format="date_time" /> },
    {
      key: "lastUsedAt",
      header: "Last used",
      width: proportional(1),
      renderCell: (token) =>
        token.lastUsedAt ? <Timestamp value={token.lastUsedAt} format="date_time" /> : <Text type="supporting">Never</Text>,
    },
    {
      key: "id",
      header: "Actions",
      width: proportional(1),
      renderCell: (token) => <Button label="Disconnect" variant="secondary" size="sm" onClick={() => setRevoking(token)} />,
    },
  ];

  return (
    <VStack gap={6}>
      <VStack gap={2}>
        <Heading level={2}>Menu-bar shelf</Heading>
        <Text type="supporting">
          Install Orion Shelf on this Mac (apps/shelf/README.md), click Connect shelf, then type the code into the shelf.
          Connecting again replaces the current connection.
        </Text>
      </VStack>
      {error ? <Banner status="error" title={error} /> : null}
      <HStack gap={4} align="center">
        <Button label="Connect shelf" variant="primary" onClick={() => void handleConnect()} />
        {code && !isExpired ? (
          <HStack gap={2} align="center">
            <Text type="code" size="xl">
              {code.code}
            </Text>
            <Button label="Copy code" variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(code.code)} />
            <Text type="supporting">{`Expires in ${remaining(code.expiresAt, now)}`}</Text>
          </HStack>
        ) : null}
        {isExpired ? <Text type="supporting">That code expired. Make a new one.</Text> : null}
      </HStack>
      {tokens.length > 0 ? (
        <Table data={tokens} columns={columns} idKey="id" density="balanced" dividers="rows" verticalAlign="middle" />
      ) : (
        <EmptyState title="No shelf connected" description="Connect the shelf to save images from anywhere on your Mac." />
      )}
      <ConfirmDeleteDialog
        isOpen={revoking !== null}
        count={1}
        title="Disconnect this shelf?"
        description="It stops saving right away. Images waiting on the Mac are kept until you connect again."
        confirmLabel="Disconnect shelf"
        onOpenChange={(isOpen) => {
          if (!isOpen) setRevoking(null);
        }}
        onConfirm={() => {
          if (revoking) void handleDisconnect(revoking);
        }}
      />
    </VStack>
  );
}
```

`apps/web/src/app/(app)/[workspaceId]/settings/shelf/page.tsx`:

```tsx
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { ShelfSettingsView } from "@/features/inspiration/components/shelf-settings-view";
import { listShelfTokens } from "@/features/inspiration/shelf-connection";
import { SettingsTabs } from "@/features/workspaces/settings-tabs";

export default async function ShelfSettingsPage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const tokens = await listShelfTokens(workspaceId);

  return (
    <Layout
      height="fill"
      header={
        <LayoutHeader hasDivider>
          <VStack gap={1} paddingInline={6} paddingBlock={4}>
            <Heading level={1}>Shelf</Heading>
            <Text type="supporting">Save images into Orion from anywhere on your Mac.</Text>
          </VStack>
          <HStack paddingInline={6}>
            <SettingsTabs workspaceId={workspaceId} />
          </HStack>
        </LayoutHeader>
      }
    >
      <LayoutContent padding={0}>
        <Section variant="transparent" padding={6}>
          <ShelfSettingsView workspaceId={workspaceId} initialTokens={tokens} />
        </Section>
      </LayoutContent>
    </Layout>
  );
}
```

`apps/web/src/features/workspaces/settings-tabs.tsx`: add `const shelfPath = \`/${workspaceId}/settings/shelf\`;`, compute `value` as `pathname.startsWith(shelfPath) ? "shelf" : pathname.startsWith(devicesPath) ? "ai-connections" : "members"`, and add `<Tab value="shelf" label="Shelf" href={shelfPath} />` after the AI connections tab.

- [ ] **Step 4: Run the tests and checks**

Run: `pnpm --filter @meld/web test -- shelf-settings settings-tabs && pnpm --filter @meld/web typecheck && pnpm check:astryx`
Expected: PASS / exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/inspiration/components/shelf-settings-view.tsx apps/web/src/features/inspiration/components/shelf-settings-view.test.tsx \
  apps/web/src/app/\(app\)/\[workspaceId\]/settings/shelf apps/web/src/features/workspaces/settings-tabs.tsx apps/web/src/features/workspaces/settings-tabs.test.tsx
git commit -m "feat(settings): Shelf tab to connect and disconnect the Mac shelf"
```

---
### Task 12: The Orion Shelf app (menu bar, panel, connect, settings, hotkey)

**Load the `swiftui-pro` skill first and read every reference except `resizability.md` and `navigation.md` (iOS-only).** This task is mostly SwiftUI. `ShelfDesign` holds every number, all logic lives in `AppModel`/`PanelModel`/`ConnectModel`, and views only lay out.

**Files (all under `apps/shelf/`):**
- Modify: `Package.swift` (add the `OrionShelf` executable target and the `OrionShelfTests` test target)
- Create: `AppBundle/Info.plist`, `scripts/build-app.sh`, `README.md`
- Create `Sources/OrionShelf/`:
  - `App/OrionShelfApp.swift`, `App/AppDelegate.swift`, `App/AppModel.swift`, `App/AppDependencies.swift`, `App/LaunchAtLogin.swift`, `App/SMAppServiceLaunchAtLogin.swift`, `App/RecentCapture.swift`
  - `StatusItem/StatusItemController.swift`, `StatusItem/StatusItemDropTarget.swift`, `StatusItem/StatusIcon.swift`, `StatusItem/TransientMessageView.swift`
  - `Panel/PanelView.swift`, `Panel/PanelModel.swift`, `Panel/ShelfDropItem.swift`, `Panel/DropZoneView.swift`, `Panel/NoteFieldView.swift`, `Panel/RoomPickerView.swift`, `Panel/WaitingRowView.swift`, `Panel/RecentThumbnailsView.swift`, `Panel/RecentThumbnailView.swift`, `Panel/MessageBannerView.swift`, `Panel/PanelFooterView.swift`
  - `Connect/ConnectView.swift`, `Connect/ConnectModel.swift`
  - `Settings/SettingsView.swift`
  - `Hotkey/GlobalHotkey.swift`
  - `Design/ShelfDesign.swift`
- Create `Tests/OrionShelfTests/`: `TestDependencies.swift`, `FakeLaunchAtLogin.swift`, `URLRecorder.swift`, `AppModelTests.swift`, `PanelModelTests.swift`, `ConnectModelTests.swift`

**Interfaces:**
- Consumes: all of ShelfCore (Tasks 4 and 6) and `ShelfTestSupport` (`TestImages`, `FakeOrionClient`, `InMemoryTokenStore`).
- Produces: the app bundle `~/Applications/Orion Shelf.app`.

- [ ] **Step 1: Extend the package**

Replace the `targets:` array in `apps/shelf/Package.swift` with:

```swift
    targets: [
        .target(
            name: "ShelfCore",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .executableTarget(
            name: "OrionShelf",
            dependencies: ["ShelfCore"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .target(
            name: "ShelfTestSupport",
            dependencies: ["ShelfCore"],
            path: "Tests/ShelfTestSupport",
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "ShelfCoreTests",
            dependencies: ["ShelfCore", "ShelfTestSupport"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
        .testTarget(
            name: "OrionShelfTests",
            dependencies: ["OrionShelf", "ShelfCore", "ShelfTestSupport"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
```

(`ShelfTestSupport` already exists from Tasks 4 and 6. This step adds the `OrionShelf` and `OrionShelfTests` targets and keeps the rest unchanged.)

- [ ] **Step 2: Write the failing model tests**

`Tests/OrionShelfTests/FakeLaunchAtLogin.swift`:

```swift
@testable import OrionShelf

final class FakeLaunchAtLogin: LaunchAtLogin {
    private(set) var isEnabled = false
    var shouldFail = false

    func setEnabled(_ enabled: Bool) throws {
        if shouldFail { throw LaunchAtLoginError.unavailable }
        isEnabled = enabled
    }
}
```

`Tests/OrionShelfTests/URLRecorder.swift`:

```swift
import Foundation

/// Collects URLs the model asks to open (a class, so a @MainActor closure can append).
@MainActor
final class URLRecorder {
    var urls: [URL] = []
}
```

`Tests/OrionShelfTests/TestDependencies.swift`:

```swift
import AppKit
import Foundation
import ShelfCore
import ShelfTestSupport
@testable import OrionShelf

/// Builds an AppModel wired to temp folders, a private pasteboard, and fakes.
@MainActor
struct TestDependencies {
    let client: FakeOrionClient
    let tokenStore: InMemoryTokenStore
    let launchAtLogin = FakeLaunchAtLogin()
    let pasteboard = NSPasteboard(name: NSPasteboard.Name("orion-shelf-test-\(UUID().uuidString)"))
    let defaults: UserDefaults
    let outboxDirectory = URL.temporaryDirectory.appending(path: "shelf-app-\(UUID().uuidString)", directoryHint: .isDirectory)

    init(client: FakeOrionClient = FakeOrionClient(), token: String? = "orion_cap_test", connectedTo workspaceName: String? = "Mine") {
        self.client = client
        self.tokenStore = InMemoryTokenStore(token: token)
        let suite = "orion-shelf-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite) ?? .standard
        if let workspaceName {
            defaults.set(UUID().uuidString, forKey: "workspaceID")
            defaults.set(workspaceName, forKey: "workspaceName")
        }
        pasteboard.clearContents()
    }

    func makeModel(onOpen: @escaping @MainActor (URL) -> Void = { _ in }) -> AppModel {
        AppModel(dependencies: AppDependencies(
            outbox: Outbox(directory: outboxDirectory),
            outboxDirectory: outboxDirectory,
            normalizer: ImageNormalizer(),
            pasteboardReader: PasteboardReader(),
            pasteboard: pasteboard,
            defaults: defaults,
            makeClient: { [client] _ in client },
            makeTokenStore: { [tokenStore] _ in tokenStore },
            launchAtLogin: launchAtLogin,
            openURL: onOpen,
            deviceName: "Test Mac"
        ))
    }
}
```

`Tests/OrionShelfTests/AppModelTests.swift`:

```swift
import AppKit
import Foundation
import ShelfCore
import ShelfTestSupport
import Testing
@testable import OrionShelf

@MainActor
struct AppModelTests {
    private func png() -> CapturedImage {
        CapturedImage(data: TestImages.encoded(width: 8, height: 8, as: .png), sourceURL: URL(string: "https://pinterest.com/pin/1"))
    }

    @Test func captureQueuesUploadsAndRemembersTheItem() async throws {
        let itemID = UUID()
        let deps = TestDependencies(client: FakeOrionClient(uploadResults: [.success(ShelfUploadResponse(itemId: itemID, duplicate: false, roomLinked: false))]))
        let model = deps.makeModel()

        await model.capture([png()], note: "nav", roomID: nil)
        await model.retryNow()

        #expect(model.waitingCount == 0)
        #expect(model.recent.first?.itemID == itemID)
        let sent = await deps.client.uploads
        #expect(sent.first?.note == "nav")
        #expect(sent.first?.sourceURL == URL(string: "https://pinterest.com/pin/1"))
    }

    @Test func nonImagesAreRefusedWithAMessage() async {
        let model = TestDependencies().makeModel()
        await model.capture([CapturedImage(data: Data("text".utf8), sourceURL: nil)], note: nil, roomID: nil)
        #expect(model.icon == .rejected)
        #expect(model.lastMessage == "Only images for now.")
    }

    @Test func anEmptyClipboardSaysSo() async {
        let model = TestDependencies().makeModel()
        await model.captureClipboard()
        #expect(model.lastMessage == "No image on the clipboard.")
    }

    @Test func theClipboardIsReadFromTheInjectedPasteboard() async {
        let deps = TestDependencies(client: FakeOrionClient(uploadResults: [.success(ShelfUploadResponse(itemId: UUID(), duplicate: false, roomLinked: false))]))
        deps.pasteboard.setData(TestImages.encoded(width: 8, height: 8, as: .png), forType: .png)
        let model = deps.makeModel()

        await model.captureClipboard()
        await model.retryNow()

        #expect(await deps.client.uploads.count == 1)
    }

    @Test func aRevokedTokenDisconnectsButKeepsTheQueue() async {
        let unauthorized = ShelfAPIError(code: .unauthorized, message: "Reconnect the shelf in Orion Settings → Shelf.")
        let deps = TestDependencies(client: FakeOrionClient(uploadResults: [.failure(unauthorized)]))
        let model = deps.makeModel()

        await model.capture([png()], note: nil, roomID: nil)
        await model.retryNow()

        #expect(model.connection == .disconnected)
        #expect(model.icon == .disconnected)
        #expect(model.waitingCount == 1)
    }

    @Test func connectStoresTheTokenAndTurnsOnLaunchAtLogin() async throws {
        let workspaceID = UUID()
        let deps = TestDependencies(
            client: FakeOrionClient(connectResult: .success(ShelfConnectResponse(token: "orion_cap_new", workspaceId: workspaceID, workspaceName: "Studio"))),
            token: nil,
            connectedTo: nil
        )
        let model = deps.makeModel()

        try await model.connect(baseURLString: "http://127.0.0.1:3000", code: "ABCD1234")

        #expect(model.connection == .connected(workspaceID: workspaceID, workspaceName: "Studio"))
        #expect(try deps.tokenStore.token() == "orion_cap_new")
        #expect(deps.launchAtLogin.isEnabled)
    }

    @Test func connectRejectsANonWebAddress() async {
        let model = TestDependencies(token: nil, connectedTo: nil).makeModel()
        await #expect(throws: ShelfAPIError.self) {
            try await model.connect(baseURLString: "ftp://nope", code: "ABCD1234")
        }
    }

    @Test func openLibraryLinksToTheItem() throws {
        let recorder = URLRecorder()
        let model = TestDependencies().makeModel { recorder.urls.append($0) }
        let itemID = UUID()

        model.openLibrary(itemID: itemID)

        let url = try #require(recorder.urls.first)
        #expect(url.path().hasSuffix("/inspiration"))
        #expect(url.query()?.contains("item=\(itemID.uuidString.lowercased())") == true)
    }

    @Test func disconnectForgetsTheToken() throws {
        let deps = TestDependencies()
        let model = deps.makeModel()
        model.disconnect()
        #expect(model.connection == .disconnected)
        #expect(try deps.tokenStore.token() == nil)
    }
}
```

`Tests/OrionShelfTests/PanelModelTests.swift`:

```swift
import Foundation
import ShelfCore
import ShelfTestSupport
import Testing
@testable import OrionShelf

@MainActor
struct PanelModelTests {
    @Test func loadsRoomsAndDropsAStaleSelection() async {
        let room = ShelfRoom(roomId: UUID(), roomName: "Login", projectName: "App")
        let model = TestDependencies(client: FakeOrionClient(roomsResult: .success([room]))).makeModel()
        let panel = PanelModel()
        panel.selectedRoomID = UUID()

        await panel.loadRooms(using: model)

        #expect(panel.rooms == [room])
        #expect(panel.selectedRoomID == nil)
    }

    @Test func savingUsesTheNoteAndRoomOnceThenClearsTheNote() async {
        let room = UUID()
        let deps = TestDependencies(client: FakeOrionClient(uploadResults: [.success(ShelfUploadResponse(itemId: UUID(), duplicate: false, roomLinked: true))]))
        let model = deps.makeModel()
        let panel = PanelModel()
        panel.note = "  love this  "
        panel.selectedRoomID = room

        await panel.capture([CapturedImage(data: TestImages.encoded(width: 4, height: 4, as: .png), sourceURL: nil)], using: model)
        await model.retryNow()

        #expect(panel.note.isEmpty)
        let sent = await deps.client.uploads
        #expect(sent.first?.note == "love this")
        #expect(sent.first?.roomID == room)
    }
}
```

`Tests/OrionShelfTests/ConnectModelTests.swift`:

```swift
import Foundation
import ShelfCore
import ShelfTestSupport
import Testing
@testable import OrionShelf

@MainActor
struct ConnectModelTests {
    @Test func showsTheServerMessageInline() async {
        let failure = ShelfAPIError(code: .invalidCode, message: "That code didn't work. Make a new one in Orion Settings → Shelf.")
        let model = TestDependencies(client: FakeOrionClient(connectResult: .failure(failure)), token: nil, connectedTo: nil).makeModel()
        let connect = ConnectModel()
        connect.prefill(from: model.baseURL)
        connect.code = "nope"

        await connect.connect(using: model)

        #expect(connect.errorMessage == failure.message)
        #expect(!connect.isConnecting)
    }

    @Test func clearsTheCodeAfterConnecting() async {
        let model = TestDependencies(token: nil, connectedTo: nil).makeModel()
        let connect = ConnectModel()
        connect.prefill(from: model.baseURL)
        connect.code = "ABCD1234"

        await connect.connect(using: model)

        #expect(connect.code.isEmpty)
        #expect(connect.errorMessage == nil)
    }
}
```

- [ ] **Step 3: Run them and confirm they fail**

Run: `cd apps/shelf && swift test 2>&1 | tail -5`
Expected: build FAILS, because there are no `OrionShelf` sources yet.

- [ ] **Step 4: Implement the app**

`Sources/OrionShelf/Design/ShelfDesign.swift`:

```swift
import SwiftUI

/// Every size, spacing, and timing the shelf uses. Views never hard-code numbers.
enum ShelfDesign {
    static let panelWidth: Double = 320
    static let settingsWidth: Double = 420
    static let messageWidth: Double = 260
    static let spacing: Double = 12
    static let compactSpacing: Double = 6
    static let cornerRadius: Double = 10
    static let dropZoneHeight: Double = 112
    static let dropBorderWidth: Double = 1.5
    static let dropDash: [Double] = [6, 4]
    static let thumbnailSize: Double = 40
    static let noteLines = 1...3
    static let flashDuration: Duration = .seconds(1)
    static let messageDuration: Duration = .seconds(2)
}
```

`Sources/OrionShelf/App/LaunchAtLogin.swift`:

```swift
protocol LaunchAtLogin {
    var isEnabled: Bool { get }
    func setEnabled(_ enabled: Bool) throws
}

enum LaunchAtLoginError: Error {
    case unavailable
}
```

`Sources/OrionShelf/App/SMAppServiceLaunchAtLogin.swift`:

```swift
import ServiceManagement

struct SMAppServiceLaunchAtLogin: LaunchAtLogin {
    var isEnabled: Bool { SMAppService.mainApp.status == .enabled }

    func setEnabled(_ enabled: Bool) throws {
        if enabled {
            try SMAppService.mainApp.register()
        } else {
            try SMAppService.mainApp.unregister()
        }
    }
}
```

`Sources/OrionShelf/App/AppDependencies.swift`:

```swift
import AppKit
import ShelfCore

/// Everything AppModel touches outside itself, injected so tests use fakes.
struct AppDependencies {
    let outbox: Outbox
    let outboxDirectory: URL
    let normalizer: ImageNormalizer
    let pasteboardReader: PasteboardReader
    let pasteboard: NSPasteboard
    let defaults: UserDefaults
    let makeClient: (URL) -> any OrionClient
    let makeTokenStore: (URL) -> any TokenStore
    let launchAtLogin: any LaunchAtLogin
    let openURL: @MainActor (URL) -> Void
    let deviceName: String

    @MainActor
    static var live: AppDependencies {
        AppDependencies(
            outbox: Outbox(),
            outboxDirectory: Outbox.defaultDirectory,
            normalizer: ImageNormalizer(),
            pasteboardReader: PasteboardReader(),
            pasteboard: .general,
            defaults: .standard,
            makeClient: { URLSessionOrionClient(baseURL: $0) },
            makeTokenStore: { KeychainTokenStore(account: $0.absoluteString) },
            launchAtLogin: SMAppServiceLaunchAtLogin(),
            openURL: { NSWorkspace.shared.open($0) },
            deviceName: Host.current().localizedName ?? String(localized: "Mac")
        )
    }
}
```

`Sources/OrionShelf/App/RecentCapture.swift`:

```swift
import AppKit

/// A save shown in the panel. `itemID` arrives once Orion confirms the upload.
struct RecentCapture: Identifiable {
    let id: UUID
    let thumbnail: NSImage?
    var itemID: UUID?
}
```

`Sources/OrionShelf/StatusItem/StatusIcon.swift`:

```swift
enum StatusIcon: Equatable {
    case idle
    case success
    case rejected
    case waiting(Int)
    case disconnected

    var symbolName: String {
        switch self {
        case .idle, .waiting: "sparkles"
        case .success: "checkmark.circle.fill"
        case .rejected: "xmark.circle"
        case .disconnected: "exclamationmark.triangle"
        }
    }

    var badgeText: String {
        if case .waiting(let count) = self { "\(count)" } else { "" }
    }

    var accessibilityLabel: String {
        switch self {
        case .idle: String(localized: "Orion Shelf")
        case .success: String(localized: "Saved to Orion")
        case .rejected: String(localized: "Couldn't save")
        case .waiting(let count): String(localized: "Orion Shelf, \(count) waiting")
        case .disconnected: String(localized: "Orion Shelf is disconnected")
        }
    }
}
```

`Sources/OrionShelf/App/AppModel.swift`:

```swift
import AppKit
import Observation
import ShelfCore

/// The shelf's single source of truth. Views and the status item only read it
/// and call its methods; all decisions live here or in ShelfCore.
@MainActor
@Observable
final class AppModel {
    static let defaultBaseURL: URL = {
        guard let url = URL(string: "http://127.0.0.1:3000") else { fatalError("The built-in Orion address is invalid") }
        return url
    }()

    private enum DefaultsKey {
        static let baseURL = "baseURL"
        static let workspaceID = "workspaceID"
        static let workspaceName = "workspaceName"
    }

    private(set) var connection: ConnectionState
    private(set) var icon: StatusIcon
    private(set) var waitingCount = 0
    private(set) var recent: [RecentCapture] = []
    private(set) var lastMessage: String?
    private(set) var baseURL: URL
    var launchAtLogin: Bool {
        didSet { applyLaunchAtLogin(previous: oldValue) }
    }

    /// Lets the status item show a message when the panel is closed.
    @ObservationIgnored var transientMessageHandler: ((String) -> Void)?

    @ObservationIgnored private let dependencies: AppDependencies
    @ObservationIgnored private var uploader: Uploader
    @ObservationIgnored private var drainTask: Task<Void, Never>?
    @ObservationIgnored private var iconResetTask: Task<Void, Never>?

    init(dependencies: AppDependencies) {
        self.dependencies = dependencies
        let defaults = dependencies.defaults
        let baseURL = defaults.string(forKey: DefaultsKey.baseURL).flatMap(URL.init(string:)) ?? Self.defaultBaseURL
        let connection: ConnectionState = if
            let workspaceID = defaults.string(forKey: DefaultsKey.workspaceID).flatMap(UUID.init(uuidString:)),
            let workspaceName = defaults.string(forKey: DefaultsKey.workspaceName) {
            .connected(workspaceID: workspaceID, workspaceName: workspaceName)
        } else {
            .disconnected
        }
        self.baseURL = baseURL
        self.connection = connection
        self.icon = connection == .disconnected ? .disconnected : .idle
        self.launchAtLogin = dependencies.launchAtLogin.isEnabled
        self.uploader = Uploader(
            outbox: dependencies.outbox,
            client: dependencies.makeClient(baseURL),
            tokenStore: dependencies.makeTokenStore(baseURL)
        )
    }

    func start() async {
        await drain()
    }

    func capture(_ images: [CapturedImage], note: String?, roomID: UUID?) async {
        var queued = 0
        var failure: String?
        for image in images {
            do {
                let normalized = try await Self.normalize(image, using: dependencies.normalizer)
                let entry = try await dependencies.outbox.enqueue(normalized, note: note, sourceURL: image.sourceURL, roomID: roomID)
                recent.insert(RecentCapture(id: entry.id, thumbnail: NSImage(data: normalized.data), itemID: nil), at: 0)
                queued += 1
            } catch let error as NormalizationError {
                failure = Self.message(for: error)
            } catch {
                failure = String(localized: "Couldn't keep that image on this Mac.")
            }
        }
        recent = Array(recent.prefix(Limits.recentCount))
        if let failure { report(failure) }
        flash(queued > 0 ? .success : .rejected)
        if queued == 0, failure == nil { report(String(localized: "Only images for now.")) }
        scheduleDrain()
    }

    func captureClipboard(note: String? = nil, roomID: UUID? = nil) async {
        let images = dependencies.pasteboardReader.images(from: dependencies.pasteboard)
        guard !images.isEmpty else {
            report(String(localized: "No image on the clipboard."))
            flash(.rejected)
            return
        }
        await capture(images, note: note, roomID: roomID)
    }

    func retryNow() async {
        drainTask?.cancel()
        await drain()
    }

    func connect(baseURLString: String, code: String) async throws(ShelfAPIError) {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), url.scheme == "http" || url.scheme == "https" else {
            throw ShelfAPIError(code: .unavailable, message: String(localized: "That Orion address doesn't look right."))
        }
        let client = dependencies.makeClient(url)
        let response = try await client.connect(code: code, deviceName: dependencies.deviceName)
        do {
            try dependencies.makeTokenStore(url).save(response.token)
        } catch {
            throw ShelfAPIError(code: .unavailable, message: String(localized: "Couldn't store the key in your Keychain."))
        }

        drainTask?.cancel()
        baseURL = url
        uploader = Uploader(outbox: dependencies.outbox, client: client, tokenStore: dependencies.makeTokenStore(url))
        dependencies.defaults.set(url.absoluteString, forKey: DefaultsKey.baseURL)
        dependencies.defaults.set(response.workspaceId.uuidString, forKey: DefaultsKey.workspaceID)
        dependencies.defaults.set(response.workspaceName, forKey: DefaultsKey.workspaceName)
        connection = .connected(workspaceID: response.workspaceId, workspaceName: response.workspaceName)
        icon = idleIcon
        if !launchAtLogin { launchAtLogin = true }
        scheduleDrain()
    }

    func disconnect() {
        do {
            try dependencies.makeTokenStore(baseURL).delete()
        } catch {
            report(String(localized: "Couldn't remove the key from your Keychain."))
        }
        markDisconnected()
    }

    func loadRooms() async -> [ShelfRoom] {
        guard connection != .disconnected, let token = try? dependencies.makeTokenStore(baseURL).token() else { return [] }
        do {
            return try await dependencies.makeClient(baseURL).rooms(token: token)
        } catch {
            if error.code == .unauthorized { markDisconnected() }
            report(error.message)
            return []
        }
    }

    func openLibrary(itemID: UUID? = nil) {
        guard case .connected(let workspaceID, _) = connection else { return }
        var url = baseURL.appending(path: "\(workspaceID.uuidString.lowercased())/inspiration")
        if let itemID {
            url.append(queryItems: [URLQueryItem(name: "item", value: itemID.uuidString.lowercased())])
        }
        dependencies.openURL(url)
    }

    func openOutboxFolder() {
        dependencies.openURL(dependencies.outboxDirectory)
    }

    func dismissMessage() {
        lastMessage = nil
    }

    func quit() {
        NSApplication.shared.terminate(nil)
    }

    // MARK: - Private

    private var idleIcon: StatusIcon {
        if connection == .disconnected {
            .disconnected
        } else if waitingCount > 0 {
            .waiting(waitingCount)
        } else {
            .idle
        }
    }

    private func scheduleDrain(after delay: Duration = .zero) {
        drainTask?.cancel()
        drainTask = Task { [weak self] in
            if delay > .zero {
                do {
                    try await Task.sleep(for: delay)
                } catch {
                    return
                }
            }
            await self?.drain()
        }
    }

    private func drain() async {
        let report = await uploader.drain()
        waitingCount = report.remaining
        for uploaded in report.uploaded {
            if let index = recent.firstIndex(where: { $0.id == uploaded.entryID }) {
                recent[index].itemID = uploaded.response.itemId
            }
        }
        if let rejected = report.rejected.last { self.report(rejected.message) }
        if report.isUnauthorized { markDisconnected() }
        if iconResetTask == nil { icon = idleIcon }
        if let retryAfter = report.retryAfter { scheduleDrain(after: retryAfter) }
    }

    private func markDisconnected() {
        dependencies.defaults.removeObject(forKey: DefaultsKey.workspaceID)
        dependencies.defaults.removeObject(forKey: DefaultsKey.workspaceName)
        connection = .disconnected
        icon = .disconnected
    }

    private func report(_ message: String) {
        lastMessage = message
        transientMessageHandler?(message)
    }

    private func flash(_ state: StatusIcon) {
        icon = state
        iconResetTask?.cancel()
        iconResetTask = Task { [weak self] in
            do {
                try await Task.sleep(for: ShelfDesign.flashDuration)
            } catch {
                return
            }
            guard let self else { return }
            self.iconResetTask = nil
            self.icon = self.idleIcon
        }
    }

    private func applyLaunchAtLogin(previous: Bool) {
        guard launchAtLogin != previous else { return }
        do {
            try dependencies.launchAtLogin.setEnabled(launchAtLogin)
        } catch {
            launchAtLogin = previous
            report(String(localized: "Couldn't turn on launch at login. Add Orion Shelf in System Settings → General → Login Items."))
        }
    }

    /// Decoding and re-encoding large images is slow, so it runs off the main actor.
    @concurrent
    private nonisolated static func normalize(_ image: CapturedImage, using normalizer: ImageNormalizer) async throws(NormalizationError) -> NormalizedImage {
        try normalizer.normalize(image)
    }

    private static func message(for error: NormalizationError) -> String {
        switch error {
        case .notAnImage: String(localized: "Only images for now.")
        case .tooLarge: String(localized: "Too large to save.")
        }
    }
}
```

`Sources/OrionShelf/App/AppDelegate.swift`:

```swift
import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let appModel = AppModel(dependencies: .live)
    private var statusItemController: StatusItemController?
    private var hotkey: GlobalHotkey?

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItemController = StatusItemController(appModel: appModel)
        let hotkey = GlobalHotkey { [appModel] in
            Task { await appModel.captureClipboard() }
        }
        hotkey.register()
        self.hotkey = hotkey
        Task { await appModel.start() }
    }
}
```

`Sources/OrionShelf/App/OrionShelfApp.swift`:

```swift
import SwiftUI

@main
struct OrionShelfApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            SettingsView()
                .environment(appDelegate.appModel)
        }
    }
}
```

`Sources/OrionShelf/Hotkey/GlobalHotkey.swift`:

```swift
import Carbon.HIToolbox

/// ⌥⌘O from any app. Carbon's RegisterEventHotKey is still the only public API
/// for a system-wide shortcut that needs no Accessibility permission.
@MainActor
final class GlobalHotkey {
    private static let signature: OSType = 0x4F52_4E53 // "ORNS"
    private var hotKeyRef: EventHotKeyRef?
    private var handlerRef: EventHandlerRef?
    private let action: @MainActor () -> Void

    init(action: @escaping @MainActor () -> Void) {
        self.action = action
    }

    func register() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let context = Unmanaged.passUnretained(self).toOpaque()
        InstallEventHandler(GetApplicationEventTarget(), { _, _, userData in
            guard let userData else { return OSStatus(eventNotHandledErr) }
            let hotkey = Unmanaged<GlobalHotkey>.fromOpaque(userData).takeUnretainedValue()
            // Carbon delivers application-target events on the main thread.
            MainActor.assumeIsolated { hotkey.action() }
            return noErr
        }, 1, &eventType, context, &handlerRef)
        RegisterEventHotKey(
            UInt32(kVK_ANSI_O),
            UInt32(cmdKey | optionKey),
            EventHotKeyID(signature: Self.signature, id: 1),
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )
    }
}
```

`Sources/OrionShelf/StatusItem/StatusItemDropTarget.swift`:

```swift
import AppKit
import ShelfCore

/// Accepts drops on the menu-bar icon itself. NSWindow forwards dragging
/// callbacks to its delegate, which is the standard way to make a status
/// item a drop target without replacing its button.
@MainActor
final class StatusItemDropTarget: NSObject, NSWindowDelegate, NSDraggingDestination {
    private let appModel: AppModel
    private let reader = PasteboardReader()

    init(appModel: AppModel) {
        self.appModel = appModel
    }

    func attach(to button: NSStatusBarButton) {
        guard let window = button.window else { return }
        window.registerForDraggedTypes([.fileURL, .URL, .png, .tiff, NSPasteboard.PasteboardType(UTType.image.identifier)])
        window.delegate = self
    }

    func draggingEntered(_ sender: any NSDraggingInfo) -> NSDragOperation {
        .copy
    }

    func performDragOperation(_ sender: any NSDraggingInfo) -> Bool {
        let images = reader.images(from: sender.draggingPasteboard)
        Task { await appModel.capture(images, note: nil, roomID: nil) }
        return !images.isEmpty
    }
}
```

(Add `import UniformTypeIdentifiers` at the top for `UTType`.)

`Sources/OrionShelf/StatusItem/TransientMessageView.swift`:

```swift
import SwiftUI

struct TransientMessageView: View {
    let message: String

    var body: some View {
        Text(message)
            .padding(ShelfDesign.spacing)
            .frame(maxWidth: ShelfDesign.messageWidth)
    }
}
```

`Sources/OrionShelf/StatusItem/StatusItemController.swift`:

```swift
import AppKit
import Observation
import SwiftUI

/// Owns the menu-bar icon and its popover. AppKit is required here: SwiftUI's
/// MenuBarExtra cannot accept drops onto the icon itself.
@MainActor
final class StatusItemController: NSObject {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let panel = NSPopover()
    private let message = NSPopover()
    private let dropTarget: StatusItemDropTarget
    private let appModel: AppModel

    init(appModel: AppModel) {
        self.appModel = appModel
        self.dropTarget = StatusItemDropTarget(appModel: appModel)
        super.init()
        panel.behavior = .transient
        panel.contentViewController = NSHostingController(rootView: PanelView().environment(appModel))
        message.behavior = .applicationDefined
        if let button = statusItem.button {
            button.target = self
            button.action = #selector(togglePanel)
            button.imagePosition = .imageLeading
            dropTarget.attach(to: button)
        }
        appModel.transientMessageHandler = { [weak self] text in self?.show(text) }
        trackIcon()
    }

    private func trackIcon() {
        withObservationTracking {
            render(appModel.icon)
        } onChange: { [weak self] in
            Task { @MainActor in self?.trackIcon() }
        }
    }

    private func render(_ icon: StatusIcon) {
        guard let button = statusItem.button else { return }
        button.image = NSImage(systemSymbolName: icon.symbolName, accessibilityDescription: icon.accessibilityLabel)
        button.title = icon.badgeText
        button.setAccessibilityLabel(icon.accessibilityLabel)
    }

    @objc private func togglePanel() {
        guard let button = statusItem.button else { return }
        if panel.isShown {
            panel.performClose(nil)
        } else {
            message.performClose(nil)
            panel.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            NSApp.activate()
        }
    }

    /// The panel shows `lastMessage` itself; this covers drops and the hotkey
    /// while the panel is closed.
    private func show(_ text: String) {
        guard !panel.isShown, let button = statusItem.button else { return }
        message.contentViewController = NSHostingController(rootView: TransientMessageView(message: text))
        message.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
        Task { [weak self] in
            try? await Task.sleep(for: ShelfDesign.messageDuration)
            self?.message.performClose(nil)
        }
    }
}
```

`Sources/OrionShelf/Panel/PanelModel.swift`:

```swift
import Foundation
import Observation
import ShelfCore

/// Panel-only state: the note and room for the next save, and the room list.
@MainActor
@Observable
final class PanelModel {
    var note = ""
    var selectedRoomID: UUID?
    private(set) var rooms: [ShelfRoom] = []

    func loadRooms(using appModel: AppModel) async {
        rooms = await appModel.loadRooms()
        if let selectedRoomID, !rooms.contains(where: { $0.roomId == selectedRoomID }) {
            self.selectedRoomID = nil
        }
    }

    func capture(_ images: [CapturedImage], using appModel: AppModel) async {
        await appModel.capture(images, note: takeNote(), roomID: selectedRoomID)
    }

    func paste(using appModel: AppModel) async {
        await appModel.captureClipboard(note: takeNote(), roomID: selectedRoomID)
    }

    /// The note applies to the next save only (spec B1), so it clears here.
    private func takeNote() -> String? {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        note = ""
        return trimmed.isEmpty ? nil : String(trimmed.prefix(Limits.noteMax))
    }
}
```

`Sources/OrionShelf/Panel/ShelfDropItem.swift`:

```swift
import CoreTransferable
import Foundation
import ShelfCore
import UniformTypeIdentifiers

/// What the panel's drop zone accepts: image files from Finder or image data from apps.
struct ShelfDropItem: Transferable {
    let captured: CapturedImage

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(importedContentType: .image) { received in
            ShelfDropItem(captured: CapturedImage(data: try Data(contentsOf: received.file), sourceURL: nil))
        }
        DataRepresentation(importedContentType: .image) { data in
            ShelfDropItem(captured: CapturedImage(data: data, sourceURL: nil))
        }
    }
}
```

`Sources/OrionShelf/Panel/DropZoneView.swift`:

```swift
import ShelfCore
import SwiftUI

struct DropZoneView: View {
    let onDrop: ([CapturedImage]) -> Void
    let onPaste: () -> Void
    @State private var isTargeted = false

    var body: some View {
        RoundedRectangle(cornerRadius: ShelfDesign.cornerRadius)
            .strokeBorder(
                isTargeted ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary),
                style: StrokeStyle(lineWidth: ShelfDesign.dropBorderWidth, dash: ShelfDesign.dropDash)
            )
            .overlay {
                Label("Drop or paste images", systemImage: "photo.on.rectangle.angled")
                    .foregroundStyle(.secondary)
            }
            .frame(height: ShelfDesign.dropZoneHeight)
            .contentShape(.rect)
            .dropDestination(for: ShelfDropItem.self) { items, _ in
                onDrop(items.map(\.captured))
                return !items.isEmpty
            } isTargeted: { isTargeted = $0 }
            .focusable()
            .onPasteCommand(of: [.image, .fileURL], perform: { _ in onPaste() })
            .accessibilityLabel("Drop zone. Drop images here or press Command V to paste.")
    }
}
```

`Sources/OrionShelf/Panel/NoteFieldView.swift`:

```swift
import SwiftUI

struct NoteFieldView: View {
    @Binding var note: String

    var body: some View {
        TextField("Note for the next save (optional)", text: $note, axis: .vertical)
            .lineLimit(ShelfDesign.noteLines)
    }
}
```

`Sources/OrionShelf/Panel/RoomPickerView.swift`:

```swift
import ShelfCore
import SwiftUI

struct RoomPickerView: View {
    let rooms: [ShelfRoom]
    @Binding var selection: UUID?

    var body: some View {
        Picker("Also add to room", selection: $selection) {
            Text("Library only").tag(UUID?.none)
            ForEach(rooms) { room in
                Text("\(room.projectName) › \(room.roomName)").tag(Optional(room.roomId))
            }
        }
    }
}
```

`Sources/OrionShelf/Panel/WaitingRowView.swift`:

```swift
import SwiftUI

struct WaitingRowView: View {
    let count: Int
    let retry: () -> Void

    var body: some View {
        HStack {
            Label("Waiting: \(count)", systemImage: "clock")
            Spacer()
            Button("Retry now", systemImage: "arrow.clockwise", action: retry)
        }
    }
}
```

`Sources/OrionShelf/Panel/RecentThumbnailView.swift`:

```swift
import SwiftUI

struct RecentThumbnailView: View {
    let capture: RecentCapture
    let open: (UUID) -> Void

    var body: some View {
        Button(action: openInOrion) {
            thumbnail
                .resizable()
                .scaledToFill()
                .frame(width: ShelfDesign.thumbnailSize, height: ShelfDesign.thumbnailSize)
                .clipShape(.rect(cornerRadius: ShelfDesign.compactSpacing))
        }
        .buttonStyle(.plain)
        .disabled(capture.itemID == nil)
        .accessibilityLabel(capture.itemID == nil ? "Saving…" : "Open in Orion")
    }

    private var thumbnail: Image {
        if let image = capture.thumbnail {
            Image(nsImage: image)
        } else {
            Image(systemName: "photo")
        }
    }

    private func openInOrion() {
        if let itemID = capture.itemID { open(itemID) }
    }
}
```

`Sources/OrionShelf/Panel/RecentThumbnailsView.swift`:

```swift
import SwiftUI

struct RecentThumbnailsView: View {
    let recent: [RecentCapture]
    let open: (UUID) -> Void

    var body: some View {
        HStack(spacing: ShelfDesign.compactSpacing) {
            ForEach(recent) { capture in
                RecentThumbnailView(capture: capture, open: open)
            }
        }
    }
}
```

`Sources/OrionShelf/Panel/MessageBannerView.swift`:

```swift
import SwiftUI

struct MessageBannerView: View {
    let message: String
    let dismiss: () -> Void

    var body: some View {
        HStack(alignment: .top) {
            Label(message, systemImage: "exclamationmark.circle")
            Spacer()
            Button("Dismiss", systemImage: "xmark", action: dismiss)
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
        }
        .foregroundStyle(.secondary)
    }
}
```

`Sources/OrionShelf/Panel/PanelFooterView.swift`:

```swift
import SwiftUI

struct PanelFooterView: View {
    let openLibrary: () -> Void
    let quit: () -> Void

    var body: some View {
        HStack {
            Button("Open Library", systemImage: "square.grid.2x2", action: openLibrary)
            Spacer()
            SettingsLink {
                Label("Settings…", systemImage: "gearshape")
            }
            Button("Quit", systemImage: "power", action: quit)
        }
        .labelStyle(.titleAndIcon)
        .buttonStyle(.borderless)
    }
}
```

`Sources/OrionShelf/Panel/PanelView.swift`:

```swift
import ShelfCore
import SwiftUI

struct PanelView: View {
    @Environment(AppModel.self) private var appModel
    @State private var model = PanelModel()

    var body: some View {
        VStack(alignment: .leading, spacing: ShelfDesign.spacing) {
            if appModel.connection == .disconnected {
                ConnectView()
            } else {
                if let message = appModel.lastMessage {
                    MessageBannerView(message: message, dismiss: appModel.dismissMessage)
                }
                DropZoneView(onDrop: capture, onPaste: paste)
                NoteFieldView(note: $model.note)
                RoomPickerView(rooms: model.rooms, selection: $model.selectedRoomID)
                if appModel.waitingCount > 0 {
                    WaitingRowView(count: appModel.waitingCount, retry: retry)
                }
                RecentThumbnailsView(recent: appModel.recent, open: openItem)
                Divider()
                PanelFooterView(openLibrary: openLibrary, quit: appModel.quit)
            }
        }
        .padding(ShelfDesign.spacing)
        .frame(width: ShelfDesign.panelWidth)
        .task(id: appModel.connection) {
            await model.loadRooms(using: appModel)
        }
    }

    private func capture(_ images: [CapturedImage]) {
        Task { await model.capture(images, using: appModel) }
    }

    private func paste() {
        Task { await model.paste(using: appModel) }
    }

    private func retry() {
        Task { await appModel.retryNow() }
    }

    private func openItem(_ itemID: UUID) {
        appModel.openLibrary(itemID: itemID)
    }

    private func openLibrary() {
        appModel.openLibrary()
    }
}
```

(`task(id:)` needs `ConnectionState: Equatable`, which it already is. If the compiler also requires `Hashable` for `id:`, add `Hashable` to `ConnectionState` in ShelfCore.)

`Sources/OrionShelf/Connect/ConnectModel.swift`:

```swift
import Foundation
import Observation
import ShelfCore

@MainActor
@Observable
final class ConnectModel {
    var baseURLText = ""
    var code = ""
    private(set) var errorMessage: String?
    private(set) var isConnecting = false

    func prefill(from baseURL: URL) {
        if baseURLText.isEmpty { baseURLText = baseURL.absoluteString }
    }

    func connect(using appModel: AppModel) async {
        isConnecting = true
        errorMessage = nil
        defer { isConnecting = false }
        do {
            try await appModel.connect(baseURLString: baseURLText, code: code)
            code = ""
        } catch {
            errorMessage = error.message
        }
    }
}
```

`Sources/OrionShelf/Connect/ConnectView.swift`:

```swift
import SwiftUI

struct ConnectView: View {
    @Environment(AppModel.self) private var appModel
    @State private var model = ConnectModel()

    var body: some View {
        VStack(alignment: .leading, spacing: ShelfDesign.spacing) {
            ContentUnavailableView(
                "Connect the shelf",
                systemImage: "link",
                description: Text("In Orion, open Settings → Shelf and click Connect shelf.")
            )
            TextField("Orion address", text: $model.baseURLText)
            TextField("Code", text: $model.code)
                .onSubmit(connect)
            if let errorMessage = model.errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
            }
            Button("Connect", action: connect)
                .buttonStyle(.borderedProminent)
                .disabled(model.code.isEmpty || model.isConnecting)
        }
        .onAppear(perform: prefill)
    }

    private func prefill() {
        model.prefill(from: appModel.baseURL)
    }

    private func connect() {
        Task { await model.connect(using: appModel) }
    }
}
```

`Sources/OrionShelf/Settings/SettingsView.swift`:

```swift
import SwiftUI

struct SettingsView: View {
    @Environment(AppModel.self) private var appModel

    var body: some View {
        @Bindable var appModel = appModel
        Form {
            Section("Connection") {
                LabeledContent("Orion", value: appModel.baseURL.absoluteString)
                if case .connected(_, let workspaceName) = appModel.connection {
                    LabeledContent("Workspace", value: workspaceName)
                    Button("Disconnect", role: .destructive, action: appModel.disconnect)
                } else {
                    Text("Not connected")
                        .foregroundStyle(.secondary)
                }
            }
            Section("General") {
                Toggle("Open at login", isOn: $appModel.launchAtLogin)
            }
            Section("Waiting images") {
                Button("Open outbox folder", systemImage: "folder", action: appModel.openOutboxFolder)
            }
        }
        .formStyle(.grouped)
        .frame(width: ShelfDesign.settingsWidth)
    }
}
```

`apps/shelf/AppBundle/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.orion.shelf</string>
    <key>CFBundleName</key>
    <string>Orion Shelf</string>
    <key>CFBundleDisplayName</key>
    <string>Orion Shelf</string>
    <key>CFBundleExecutable</key>
    <string>OrionShelf</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>26.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
    </dict>
</dict>
</plist>
```

`apps/shelf/scripts/build-app.sh`:

```bash
#!/bin/bash
# Builds "Orion Shelf.app" for this Mac only (ad-hoc signed, no Apple account)
# and installs it into ~/Applications.
set -euo pipefail

cd "$(dirname "$0")/.."
swift build -c release --product OrionShelf
BIN_DIR="$(swift build -c release --show-bin-path)"
APP="build/Orion Shelf.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp AppBundle/Info.plist "$APP/Contents/Info.plist"
cp "$BIN_DIR/OrionShelf" "$APP/Contents/MacOS/OrionShelf"
codesign --force --sign - "$APP"

mkdir -p "$HOME/Applications"
rm -rf "$HOME/Applications/Orion Shelf.app"
cp -R "$APP" "$HOME/Applications/"
echo "Installed: $HOME/Applications/Orion Shelf.app"
```

Run `chmod +x apps/shelf/scripts/build-app.sh`.

`apps/shelf/README.md`:

```markdown
# Orion Shelf

A menu-bar app that saves images into your Orion Inspiration library from
anywhere on this Mac. Built for one Mac (yours); no Apple developer account.

## Install
1. `cd apps/shelf && ./scripts/build-app.sh`
2. Open `~/Applications/Orion Shelf.app`. A ✨ appears in the menu bar.

## Connect
1. In Orion (running locally), open **Settings → Shelf → Connect shelf**.
2. Click the ✨, type the code, and click **Connect**.

## Use
- Drag any image onto the ✨, or copy an image and press **⌥⌘O**.
- Click the ✨ for a note, "also add to room", and your recent saves.
- If Orion isn't running, images wait and send later.

## Uninstall
Quit from the panel, delete `~/Applications/Orion Shelf.app`, and remove
`~/Library/Application Support/Orion/shelf-outbox`. Disconnect it in
Orion Settings → Shelf.

## Develop
`swift build`, `swift test`. Read `.claude/skills/swiftui-pro` first.
```

- [ ] **Step 5: Run the tests and confirm they pass with zero warnings**

Run: `cd apps/shelf && swift build 2>&1 | grep -c "warning:"; swift test 2>&1 | tail -3`
Expected: `0`, then all tests pass.

- [ ] **Step 6: swiftui-pro review**

Run the `swiftui-pro` review over `apps/shelf/Sources/OrionShelf/**`. Fix every finding, or write down why it doesn't apply (for example, iPhone-only rules).

- [ ] **Step 7: Build, install, and try it**

Run: `apps/shelf/scripts/build-app.sh` and `open ~/Applications/Orion\ Shelf.app`.
Expected: the ✨ appears. Connect with a code from Settings → Shelf (Task 11). Drag an image from Safari onto the ✨ and see it in the Library. If dropping onto the icon does nothing on this macOS version, report it with the macOS version. Don't silently swap in another approach.

- [ ] **Step 8: Commit**

```bash
git add apps/shelf
git commit -m "feat(shelf): Orion Shelf menu-bar app with panel, connect, settings, and hotkey"
```

---
### Task 13: End-to-end test, real-Mac acceptance, and checklist

**Read first:** `e2e/design-figma-lane.spec.ts` (fake-mode auth cookies and fixture ids) and `playwright.config.ts`.

**Files:**
- Create: `e2e/inspiration-library.spec.ts`
- Modify: `docs/product-feature-checklist.md` (new section)

- [ ] **Step 1: Write the E2E spec**

`e2e/inspiration-library.spec.ts`:

```ts
import { crc32, deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";

// Fixtures from apps/web/src/features/rooms/e2e-fake.ts and
// apps/web/src/features/inspiration/inspiration-fake.ts.
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000005";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

// A real, decodable 2x2 PNG in a random colour, so reruns against the same
// fake store never collide with the duplicate check.
function solidPng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(2, 0);
  header.writeUInt32BE(2, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const [r, g, b] = [0, 1, 2].map(() => Math.floor(Math.random() * 256));
  const row = Buffer.from([0, r, g, b, r, g, b]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat([row, row]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test.beforeEach(async ({ context }, testInfo) => {
  const origin = testInfo.project.use.baseURL;
  if (typeof origin !== "string") throw new Error("Playwright baseURL is required for inspiration E2E auth.");
  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER_ID, url: origin },
    { name: "meld-e2e-user-email", value: "owner@example.com", url: origin },
    { name: "meld-e2e-user-name", value: "Owner Example", url: origin },
  ]);
});

test("save to the library, add to a room, remove from the room, then delete", async ({ page }) => {
  await page.goto(`/${WORKSPACE_ID}/inspiration`);
  await expect(page.getByRole("heading", { name: "Inspiration" })).toBeVisible();

  const tilesBefore = await page.getByTestId("inspiration-tile").count();
  await page.locator('input[type="file"]').setInputFiles({ name: "nav.png", mimeType: "image/png", buffer: solidPng() });
  await expect(page.getByTestId("inspiration-tile")).toHaveCount(tilesBefore + 1);

  // Newest first: the upload is the first tile.
  const tile = page.getByTestId("inspiration-tile").first();
  await tile.getByRole("checkbox", { name: "Select image" }).check();
  await page.getByRole("button", { name: "Add to room…" }).click();
  await page.getByRole("button", { name: "Add 1 image" }).click();
  await expect(page.getByText("Added 1 image to Design Room.")).toBeVisible();

  await page.goto(`/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=inspiration`);
  await expect(page.getByTestId("room-inspiration")).toBeVisible();
  const roomTiles = page.getByTestId("room-inspiration").getByTestId("inspiration-tile");
  const roomCount = await roomTiles.count();
  await roomTiles.first().getByRole("checkbox", { name: "Select image" }).check();
  await page.getByRole("button", { name: "Remove from room" }).click();
  await expect(roomTiles).toHaveCount(roomCount - 1);

  await page.goto(`/${WORKSPACE_ID}/inspiration`);
  await expect(page.getByTestId("inspiration-tile")).toHaveCount(tilesBefore + 1);
  await page.getByTestId("inspiration-tile").first().getByRole("button", { name: /^Open / }).click();
  await page.getByRole("button", { name: "Delete image" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByTestId("inspiration-tile")).toHaveCount(tilesBefore);
});
```

- [ ] **Step 2: Run it**

Run: `pnpm exec playwright test e2e/inspiration-library.spec.ts`
Expected: 1 passed. If it fails, debug with `--trace on` and fix the product code. Don't weaken the assertions.

- [ ] **Step 3: Full gate**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm check:astryx && pnpm exec playwright test`
Run: `cd apps/shelf && swift build 2>&1 | grep -c "warning:"; swift test`
Run the pgTAP files from Task 3 on a fresh scratch DB again.
Expected: everything green, `0` warnings. Paste the real output into the report.

- [ ] **Step 4: Manual acceptance on the owner's Mac** (spec Part H; screenshots into `.context/`)

With Supabase, the web app (with `MELD_SHELF_SERVICE_ROLE_KEY`), and the installed shelf running and connected:
1. Drag an image from Pinterest in **Safari** onto the ✨ → ✓ → it appears in the Library with its source link. Screenshot: `.context/accept-1-safari.png`.
2. Copy an image in **Figma** → ⌥⌘O → it appears. Screenshot: `.context/accept-2-hotkey.png`.
3. Drag a **HEIC** photo from Photos → it's saved as JPEG (the detail view shows it; `select mime_type from inspiration_items order by created_at desc limit 1` → `image/jpeg`).
4. Stop the web server → save 3 images → the icon shows `3` → start it → all 3 arrive once. Screenshot of the badge: `.context/accept-4-waiting.png`.
5. Save the same image twice → one tile.
6. In the panel pick "also add to room" → the room's Inspiration tab shows it. Screenshot: `.context/accept-6-room.png`.
7. Settings → Shelf → Disconnect → the shelf shows the warning → reconnect with a new code → waiting images upload.

Record pass or fail for each step. Any failure is a bug to fix before finishing, not a footnote.

- [ ] **Step 5: Update the checklist**

Append to `docs/product-feature-checklist.md`, before "## Repeatable verification":

```markdown
## 12. Inspiration (Orion Step 1)

| Done | ID | Feature | Check | Evidence |
|---|---|---|---|---|
| [x] | INS-01 | Inspiration Library page: grid, upload, paste, load more, detail, notes, delete | `pnpm --filter @meld/web test -- features/inspiration`; `e2e/inspiration-library.spec.ts` | Task 9, 13 |
| [x] | INS-02 | One write path with server-side type/size/dimension validation and dedupe | `save-inspiration-item.test.ts`; `supabase/tests/inspiration.test.sql` | Task 3, 5 |
| [x] | INS-03 | Add to / remove from rooms; room Inspiration tab emerges with content | `surfaces.test.ts`; `room-inspiration-surface.test.tsx`; E2E | Task 10, 13 |
| [x] | INS-04 | Upload-only shelf token: connect code, hashed storage, revoke, one active per user | `supabase/tests/capture_tokens.test.sql`; `app/api/shelf/**/route.test.ts` | Task 3, 7, 11 |
| [x] | INS-05 | Mac shelf: drag onto icon, ⌥⌘O, panel note/room, recent saves | `swift test` (OrionShelfTests); manual steps 1, 2, 6 | Task 12, 13 |
| [x] | INS-06 | Shelf normalization (HEIC→JPEG, GIF/TIFF→PNG, downscale to limits) | `swift test` (ImageNormalizerTests); manual step 3 | Task 4, 13 |
| [x] | INS-07 | Offline outbox with backoff, 401 stop, rejected folder | `swift test` (UploaderTests, OutboxTests); manual steps 4, 7 | Task 4, 6, 13 |
```

Only tick a box after its check actually passed. Leave it `[ ]` with a note otherwise.

- [ ] **Step 6: Commit**

```bash
git add e2e/inspiration-library.spec.ts docs/product-feature-checklist.md
git commit -m "test(inspiration): end-to-end library flow and checklist entries"
```

---

## Self-review notes (plan author)

- **Spec coverage:** B1 → Tasks 4, 6, 12 · B2 → Tasks 3, 7, 8, 11 · B3 → Tasks 8, 9 · B4 → Task 10 · B5 → Tasks 3, 5, 8 · C → Task 5 · D → Task 3 · E → Tasks 1, 2, 7 · F → file map · G → Global Constraints and every task's gate · H → Tasks 3–13 · I → waves.
- **Deliberate deviations from the spec text**, recorded in the spec's "Implementation notes" section: the tile checkbox is always visible (not hover-only), uploading tiles use `Skeleton`, the page's drop target is a `FileInput` dropzone plus page-wide ⌘V, the shelf icon flashes ✕ instead of shaking, panel drops don't carry a source URL (drops on the icon do), no `SettingsModel` (`AppModel` serves Settings), no String Catalog file yet, and the shelf test doubles live in a shared `ShelfTestSupport` target.
