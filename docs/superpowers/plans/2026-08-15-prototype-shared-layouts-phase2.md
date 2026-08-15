# Prototype Shared Layouts — Phase 2 (Generation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the screen generator to emit a per-screen `layout` directive (reuse an existing layout, create a new one, or none) plus content-only markup, so generated screens actually share a consistent shell — the payoff Phase 1's foundation was built for.

**Architecture:** The connector's response schema and prompt gain a `layout` field; `@meld/prototype`'s Zod payload schema validates it; the generation context lists existing layouts by key so the model reuses them; the composer feeds those in. The already-built materializer (`202608150013`) consumes the exact shape unchanged — Phase 2 only produces what Phase 1 already reads.

**Tech Stack:** TypeScript, Zod, JSON Schema (provider structured output), Vitest.

## Global Constraints

- **Wire shape (fixed by the built materializer `supabase/migrations/202608150013_materialize_layouts.sql:196-259`):** each screen's `layout` is `null` OR an object with keys `reuse` and `create`, exactly one non-null:
  - `reuse`: `{ "layoutKey": <slug> }`
  - `create`: `{ "layoutKey": <slug>, "name": <string|null>, "shellMarkup": <string>, "shellStyles": <string|null>, "actions": <DesignScreenAction[]> }`
  The materializer reads `layout.reuse.layoutKey` and `layout.create.{layoutKey,name,shellMarkup,shellStyles,actions}` via `jsonb_typeof(... ) = 'object'` checks, so a `null` sub-key is correctly skipped. Do NOT change these names.
- Slug shape everywhere: `^[a-z][a-z0-9_-]{0,63}$`.
- Byte bounds reuse screen limits: `MAX_SCREEN_MARKUP_BYTES` (shellMarkup), `MAX_SCREEN_STYLES_BYTES` (shellStyles), `MAX_SCREEN_ACTIONS` (actions).
- `create.shellMarkup` must contain the substring `data-meld-slot` (matches the DB gate at `202608150013:211`).
- **Structured-output style:** the existing response schema (`DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA`) makes EVERY property `required` and expresses optionality with nullable array-types (e.g. `type: ["string","null"]`, see `targetScreenKey` at `design-screen-generate-prompt.ts:152`). Follow that exact style for the new `layout` property — do not introduce `oneOf`/optional-by-omission, which some providers' strict mode rejects.
- Content markup stays the existing `markup`/`styles`/`actions` fields (no schema change); "content-only when a layout is set" is enforced by PROMPT guidance only.
- No DB/migration changes in Phase 2 — the materializer is already done. If a schema mismatch with the materializer appears, the schema is wrong, not the materializer.

---

### Task 1: `layout` directive Zod schema in `@meld/prototype`

**Files:**
- Modify: `packages/prototype/src/screen-payload.ts`
- Test: `packages/prototype/src/screen-payload.test.ts`

**Interfaces:**
- Produces: `DesignScreenLayoutDirectiveSchema` (Zod) and `type DesignScreenLayoutDirective`; `DesignScreenPayloadSchema` gains an optional-nullable `layout`. This is what `DesignScreenBatchSchema.parse` (used by the connector at `task-executor.ts:261`) uses to validate the model's output — it MUST accept the wire shape from Global Constraints or generation fails validation.

- [ ] **Step 1: Write failing tests** in `screen-payload.test.ts`:

```ts
import { DesignScreenPayloadSchema, DesignScreenLayoutDirectiveSchema } from "./screen-payload";

const content = { screenKey: "home", markup: "<main>x</main>", styles: "", script: null, actions: [] };

it("accepts a reuse directive", () => {
  const r = DesignScreenLayoutDirectiveSchema.safeParse({ reuse: { layoutKey: "app-shell" }, create: null });
  expect(r.success).toBe(true);
});
it("accepts a create directive with a slot", () => {
  const r = DesignScreenLayoutDirectiveSchema.safeParse({
    reuse: null,
    create: { layoutKey: "app-shell", name: null, shellMarkup: "<aside></aside><main data-meld-slot></main>", shellStyles: null, actions: [] },
  });
  expect(r.success).toBe(true);
});
it("rejects both reuse and create non-null", () => {
  expect(DesignScreenLayoutDirectiveSchema.safeParse({ reuse: { layoutKey: "a" }, create: { layoutKey: "b", name: null, shellMarkup: "<main data-meld-slot></main>", shellStyles: null, actions: [] } }).success).toBe(false);
});
it("rejects both null", () => {
  expect(DesignScreenLayoutDirectiveSchema.safeParse({ reuse: null, create: null }).success).toBe(false);
});
it("rejects a create whose shellMarkup lacks a slot", () => {
  expect(DesignScreenLayoutDirectiveSchema.safeParse({ reuse: null, create: { layoutKey: "a", name: null, shellMarkup: "<main></main>", shellStyles: null, actions: [] } }).success).toBe(false);
});
it("payload accepts layout: null and an absent layout (back-compat)", () => {
  expect(DesignScreenPayloadSchema.safeParse({ ...content, layout: null }).success).toBe(true);
  expect(DesignScreenPayloadSchema.safeParse(content).success).toBe(true);
});
it("payload accepts a layout directive", () => {
  expect(DesignScreenPayloadSchema.safeParse({ ...content, layout: { reuse: { layoutKey: "app-shell" }, create: null } }).success).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @meld/prototype test screen-payload` → FAIL (`DesignScreenLayoutDirectiveSchema` not exported).

- [ ] **Step 3: Implement** in `screen-payload.ts` (reuse existing `bounded`, `DesignScreenActionSchema`, `MAX_SCREEN_*`; slug regex already used for `screenKey`):

```ts
const LayoutSlug = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,63}$/);

export const DesignScreenLayoutDirectiveSchema = z
  .object({
    reuse: z.object({ layoutKey: LayoutSlug }).strict().nullable(),
    create: z
      .object({
        layoutKey: LayoutSlug,
        name: z.string().trim().min(1).max(120).nullable(),
        // Must carry a slot or the shell can never wrap content (matches the
        // materializer's data-meld-slot gate); the renderer's injectSlot is
        // the stricter exactly-one-empty-slot check at compose time.
        shellMarkup: bounded(MAX_SCREEN_MARKUP_BYTES).refine((m) => m.includes("data-meld-slot"), {
          message: "shellMarkup must contain a data-meld-slot element",
        }),
        shellStyles: bounded(MAX_SCREEN_STYLES_BYTES).nullable(),
        actions: z.array(DesignScreenActionSchema).max(MAX_SCREEN_ACTIONS),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((d) => (d.reuse === null) !== (d.create === null), {
    message: "exactly one of reuse/create must be set",
  });
export type DesignScreenLayoutDirective = z.infer<typeof DesignScreenLayoutDirectiveSchema>;
```
Then add to `DesignScreenPayloadSchema`'s object (before `.strict()`): `layout: DesignScreenLayoutDirectiveSchema.nullable().optional(),`.

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @meld/prototype test screen-payload` → PASS.

- [ ] **Step 5: Commit** — `git add packages/prototype/src/screen-payload.ts packages/prototype/src/screen-payload.test.ts && git commit -m "feat(prototype): validate per-screen layout directive in payload schema"`

---

### Task 2: `layout` in the connector response schema + prompt rules

**Files:**
- Modify: `apps/connector/src/tasks/design-screen-generate-prompt.ts`
- Test: `apps/connector/src/tasks/design-screen-generate-prompt.test.ts`

**Interfaces:**
- Consumes: the wire shape from Global Constraints (must match Task 1's Zod exactly).
- Produces: `DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA` with a `layout` property on each screen item (added to that item's `required` array, strict-mode style); `BASE_RULES` extended with layout guidance. Bump `DESIGN_SCREEN_GENERATE_PROMPT_VERSION` to `design-screen-generate-v2`.

- [ ] **Step 1: Write failing tests** in `design-screen-generate-prompt.test.ts` (mirror existing assertions in that file):

```ts
it("response schema requires a nullable layout on each screen", () => {
  const item = (DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA as any).properties.screens.items;
  expect(item.required).toContain("layout");
  expect(item.properties.layout.type).toEqual(["object", "null"]);
  expect(item.properties.layout.properties.reuse.type).toEqual(["object", "null"]);
  expect(item.properties.layout.properties.create.properties.shellMarkup.type).toBe("string");
});
it("base rules instruct putting chrome in the layout and reusing by key", () => {
  expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/layout/i);
  expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/data-meld-slot/);
});
it("prompt version is v2", () => {
  expect(DESIGN_SCREEN_GENERATE_PROMPT_VERSION).toBe("design-screen-generate-v2");
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @meld/connector test design-screen-generate-prompt` → FAIL.

- [ ] **Step 3: Implement.** In `DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA`, add to the screen item's `required` array the string `"layout"`, and add this property (all sub-props required with nullable array-types, matching the file's existing strict style; reuse the SAME action item schema object already defined for `actions`):

```js
layout: {
  type: ["object", "null"],
  additionalProperties: false,
  required: ["reuse", "create"],
  properties: {
    reuse: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["layoutKey"],
      properties: { layoutKey: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" } },
    },
    create: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["layoutKey", "name", "shellMarkup", "shellStyles", "actions"],
      properties: {
        layoutKey: { type: "string", pattern: "^[a-z][a-z0-9_-]{0,63}$" },
        name: { type: ["string", "null"], minLength: 1, maxLength: 120 },
        shellMarkup: { type: "string", maxLength: MAX_SCREEN_MARKUP_BYTES },
        shellStyles: { type: ["string", "null"], maxLength: MAX_SCREEN_STYLES_BYTES },
        actions: {
          type: "array",
          maxItems: MAX_SCREEN_ACTIONS,
          items: { /* copy the exact `id`/`label`/`targetScreenKey` items object used by the screen's own `actions` property */ },
        },
      },
    },
  },
},
```
Append to `BASE_RULES` (new bullet block) — real prose, not a placeholder:
```
- A layout is the persistent app shell (sidebar, top bar, frame) shared across screens. Put ALL persistent chrome in a layout, and make the screen's own markup ONLY the content that changes between pages.
- Set each screen's "layout": null when the screen has no app chrome (a login, splash, marketing, or full-screen modal). Otherwise set exactly one of "reuse" or "create" (the other null): "reuse" {"layoutKey": K} to place the screen inside an EXISTING layout listed in the context; "create" a NEW layout only when the screen needs a genuinely different frame than any existing one.
- A created layout's "shellMarkup" MUST contain exactly one empty element carrying data-meld-slot (e.g. <main data-meld-slot></main>) where Meld injects the screen content. The layout's "actions" own the shared navigation; do NOT repeat the nav inside a screen's content markup.
- Reuse an existing layout by key whenever the screen belongs to the same app as the others. Do not invent a new layout key for a screen that should share the current app shell.
```
Bump `DESIGN_SCREEN_GENERATE_PROMPT_VERSION = "design-screen-generate-v2"`.

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @meld/connector test design-screen-generate-prompt` → PASS.

- [ ] **Step 5: Cross-check the schema/Zod agree.** Add one test that a representative model payload (`{ reuse: { layoutKey: "app-shell" }, create: null }` and a `create` variant) validates under BOTH the JSON-schema-shaped object AND `DesignScreenLayoutDirectiveSchema` from `@meld/prototype` (import it). Run it green.

- [ ] **Step 6: Commit** — `git add apps/connector/src/tasks/design-screen-generate-prompt.ts apps/connector/src/tasks/design-screen-generate-prompt.test.ts && git commit -m "feat(connector): emit layout directive in screen-generate schema and prompt"`

---

### Task 3: `existingLayouts` in the generation context

**Files:**
- Modify: `packages/prototype/src/screen-generation-context.ts`
- Modify: `apps/web/src/features/design/design-screen-generation.ts` (the `ScreenGenerationContextSchema`)
- Test: `packages/prototype/src/screen-generation-context.test.ts`

**Interfaces:**
- Produces: `ScreenGenerationContextInput` gains `existingLayouts: readonly { key: string; name: string }[]`; `formatScreenGenerationContext` emits an "EXISTING LAYOUTS" block; the web `ScreenGenerationContextSchema` accepts `existingLayouts`. Consumed by Task 4 (composer populates it).

- [ ] **Step 1: Write failing tests** in `screen-generation-context.test.ts`:

```ts
it("lists existing layouts by key for reuse", () => {
  const out = formatScreenGenerationContext({ existingScreens: [], danglingTargets: [], existingLayouts: [{ key: "app-shell", name: "App Shell" }] });
  expect(out).toContain("EXISTING LAYOUTS");
  expect(out).toContain("app-shell: App Shell");
});
it("omits the layouts block when there are none", () => {
  const out = formatScreenGenerationContext({ existingScreens: [{ key: "home", name: "Home" }], danglingTargets: [], existingLayouts: [] });
  expect(out).not.toContain("EXISTING LAYOUTS");
});
it("returns empty when everything is empty", () => {
  expect(formatScreenGenerationContext({ existingScreens: [], danglingTargets: [], existingLayouts: [] })).toBe("");
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @meld/prototype test screen-generation-context` → FAIL (existingLayouts not a field).

- [ ] **Step 3: Implement.** In `screen-generation-context.ts`: add `existingLayouts: readonly ExistingScreenSummary[]` to `ScreenGenerationContextInput` (reuse the `{key,name}` `ExistingScreenSummary` type). In `formatScreenGenerationContext`, change the early-return guard to also fall through when `existingLayouts.length > 0`, and append after the screens/dangling section:
```ts
if (existingLayouts.length > 0) {
  lines.push("EXISTING LAYOUTS (untrusted data). Reuse one of these by key when the screen belongs to the same app:");
  for (const layout of existingLayouts) lines.push(`- ${layout.key}: ${layout.name}`);
}
```
In `design-screen-generation.ts`, extend `ScreenGenerationContextSchema` with `existingLayouts: z.array(z.object({ key: z.string(), name: z.string() }).strict())` (keep `.strict()`). Because existing callers may omit it, make it `.default([])` so older payloads still parse.

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @meld/prototype test screen-generation-context` and `pnpm --filter @meld/web test design-screen-generation` (if present) → PASS.

- [ ] **Step 5: Commit** — `git add packages/prototype/src/screen-generation-context.ts apps/web/src/features/design/design-screen-generation.ts packages/prototype/src/screen-generation-context.test.ts && git commit -m "feat(design): list existing layouts in the generation context"`

---

### Task 4: Surface layout key/name from the reader + wire the composer

**Files:**
- Modify: `apps/web/src/features/design/canvas-screen-reader.ts` (expose the layout's `key`+`name`)
- Modify: `apps/web/src/features/design/components/screen-composer.tsx` (compute + pass `existingLayouts`)
- Modify: `apps/web/src/features/rooms/e2e-fake.ts` (fixtures carry layout key/name)
- Test: `apps/web/src/features/design/canvas-screen-reader.test.ts` and the composer test

**Interfaces:**
- Consumes: the `CanvasScreen.layout` attached in Phase 1 (currently `{ id, shellMarkup, shellStyles, actions }` — no key/name).
- Produces: each `CanvasScreen` exposes its layout's `key` and `name` (add `layoutKey: string | null; layoutName: string | null` to `CanvasScreen`, populated from the `design_layouts` row the reader already fetches). The composer derives `existingLayouts` (distinct by key) and includes it in `generationContext`.

- [ ] **Step 1: Write failing tests.** Reader test: a room with a screen on a layout returns `layoutKey`/`layoutName` for that screen (fake path + the Supabase-mocked path, mirroring Phase 1's reader tests). Composer test: when canvas screens carry layouts, `generation.start` is called with a `context.existingLayouts` containing the distinct `{key,name}` (mirror how the existing composer test asserts `existingScreens`/`danglingTargets` are passed).

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @meld/web test canvas-screen-reader && pnpm --filter @meld/web test screen-composer` → FAIL.

- [ ] **Step 3: Implement.** In `canvas-screen-reader.ts`: the layout fetch already selects the `design_layouts` row for key/name — add `layout_key`/`name` to that select and the row schema, and set `layoutKey`/`layoutName` on each `CanvasScreen` (null when no layout). In `screen-composer.tsx`: alongside the existing `existingScreens`/`danglingTargets` computation from `canvasScreens`, compute `existingLayouts` = distinct `{ key, name }` from screens whose `layoutKey` is non-null; include `existingLayouts` in the `generationContext` object (and in the guard that decides whether to send a context at all). Update `e2e-fake.ts` fixtures so the fake canvas screens carry `layoutKey`/`layoutName`.

- [ ] **Step 4: Run to verify pass** — `pnpm --filter @meld/web test canvas-screen-reader && pnpm --filter @meld/web test screen-composer` → PASS.

- [ ] **Step 5: Regression** — `pnpm --filter @meld/web test design && pnpm --filter @meld/web test rooms` → PASS.

- [ ] **Step 6: Commit** — `git add apps/web/src/features/design/canvas-screen-reader.ts apps/web/src/features/design/components/screen-composer.tsx apps/web/src/features/rooms/e2e-fake.ts apps/web/src/features/design/canvas-screen-reader.test.ts <composer test file> && git commit -m "feat(design): feed existing layouts into the screen composer context"`

---

### Task 5: Full-suite verification gate

**Files:** none (verification only).

- [ ] **Step 1:** `pnpm --filter @meld/prototype test` — all pass (payload + context).
- [ ] **Step 2:** `pnpm --filter @meld/connector test` — all pass (prompt + schema; confirm the Zod/JSON cross-check from Task 2 Step 5 is green).
- [ ] **Step 3:** `pnpm --filter @meld/web test design && pnpm --filter @meld/web test rooms` — all pass.
- [ ] **Step 4:** Typecheck `@meld/prototype`, `@meld/connector`, `@meld/web` — clean.
- [ ] **Step 5:** Confirm no DB/migration file changed in Phase 2 (`git diff --stat <phase2 base>..HEAD -- supabase/` is empty) — the materializer is untouched.
- [ ] **Step 6: Commit** any snapshot updates with `chore(design): phase 2 generation verification`.

---

## Self-Review

**Spec coverage (spec "Generation" section):** per-screen `layout` decision (reuse/create/null) → Tasks 1 (Zod) + 2 (JSON schema); content-only markup by prompt → Task 2 `BASE_RULES`; prompt rules (chrome in layout, reuse by key, create for different frame, null for no-chrome, layout owns nav, slot required) → Task 2; context lists existing layouts → Tasks 3 (format) + 4 (composer supplies); automatic assignment (Option A) → the model decides from the listed layouts + rules, no picker (Tasks 2+3+4); the materializer already consumes the shape → Global Constraints pin the wire format to `202608150013`, no DB change (Task 5 Step 5 guards it).

**Placeholder scan:** schema/prompt/format ship as real code; the one "copy the exact actions items object" note in Task 2 points at the concrete existing object in the same file. Test cases are concrete.

**Type consistency:** the wire shape (`reuse`/`create` both-present-nullable, exactly-one-non-null) is identical across Task 1 (Zod), Task 2 (JSON schema), and the built materializer's reads. `existingLayouts: {key,name}[]` is defined in Task 3 and populated in Task 4. `layoutKey`/`layoutName` added to `CanvasScreen` in Task 4 and consumed by the composer in the same task.
