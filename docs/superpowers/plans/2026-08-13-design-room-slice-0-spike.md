# Design Room Slice 0 — Security and Architecture Spike Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove — in code, not prose — the four assumptions the Design Room design rests on: that generated screens can be rendered with no escape path, that a screen frame can ride the default tldraw schema, that Figma's oEmbed endpoint returns usable thumbnails, and that the size budgets fit the existing task caps.

**Architecture:** A new `@meld/prototype` workspace package holds the screen payload contract, the safety rejection scan, and the prototype document assembler — all pure functions with no DOM and no I/O. A standalone Playwright config mounts the assembler's output in a real sandboxed iframe and proves every escape attempt fails. Gateway and script-level checks cover the tldraw and Figma questions. The spike ends with a findings report and, where reality disagreed with the design, amendments to the spec.

**Tech Stack:** TypeScript 5.9.3, Zod 4.4.3, Vitest, Playwright, tldraw 5.3.0, Node ≥ 22.23.2, pnpm 10.28.1.

**Design spec:** `docs/superpowers/specs/2026-08-13-design-room-design.md`

## Global Constraints

- Node `>=22.23.2`; pnpm `10.28.1`. Never change these.
- tldraw packages are pinned at exactly `5.3.0` across `apps/web` and `apps/gateway`. Do not upgrade, and do not introduce a custom tldraw shape type — the gateway builds its schema with bare `createTLSchema()` and a custom type would need a schema shared by both processes.
- `MAX_RESULT_BYTES` = `256 * 1024` and `MAX_HYDRATED_CONTEXT_BYTES` = `512 * 1024`, both already defined in `packages/contracts/src/ai.ts`. Every budget in this plan must fit inside them.
- **Nothing that emits HTML may live under `apps/web/src`.** `scripts/check-astryx-conventions.mjs` scans every `.ts`, `.tsx`, and `.css` file in that tree and fails the build on the literal text `<div`, `<span`, a hardcoded color, or a hardcoded pixel value — including inside template literals and test fixtures. That is why this slice creates `packages/prototype`.
- Tests are colocated beside their source (`scripts/check-test-colocation.mjs` enforces this for `apps/*`; follow the same convention in `packages/*`).
- Generated markup, styles, and script are **data**. Nothing in this slice may write them to a Supabase storage bucket or serve them from a URL. Migration `202608010002` permits `text/html` attachments served by signed storage URL; that path is exactly the one this design forbids.
- No database migrations in this slice. Slice 0 proves boundaries; slice 1 builds foundations.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/prototype/package.json` | New workspace package `@meld/prototype`. |
| `packages/prototype/tsconfig.json` | Mirrors `packages/contracts/tsconfig.json`. |
| `packages/prototype/src/index.ts` | Re-exports the package's public surface. |
| `packages/prototype/src/screen-payload.ts` | Zod schema and byte budgets for one generated screen. |
| `packages/prototype/src/screen-payload.test.ts` | Budget and shape tests. |
| `packages/prototype/src/screen-safety.ts` | Rejection scan: the constructs a screen may never contain. |
| `packages/prototype/src/screen-safety.test.ts` | One rejection test per rule. |
| `packages/prototype/src/prototype-document.ts` | Assembles screens into one sandboxed document with CSP, scoped styles, and the routing harness. |
| `packages/prototype/src/prototype-document.test.ts` | Determinism, scoping, hoisting, escaping, routing. |
| `e2e/prototype-sandbox.spec.ts` | Proves the escape matrix fails in a real browser. |
| `playwright.sandbox.config.ts` | Standalone Playwright config — no app server, no Supabase. |
| `apps/gateway/src/canvas/sqlite-canvas-room.ts` | Gains `insertScreenFrame` beside the existing `insertServerMarker`. |
| `apps/gateway/src/canvas/sqlite-canvas-room.test.ts` | Frame + `meta.meldScreenId` round-trip. |
| `scripts/design/figma-oembed-check.mjs` | Self-testable oEmbed probe, live mode behind an env flag. |
| `scripts/design/figma-oembed-check.test.mjs` | Node test runner coverage of parsing and normalisation. |
| `docs/design/reports/2026-08-13-design-room-slice-0-findings.md` | What the spike proved, disproved, and changed. |

---

### Task 1: The `@meld/prototype` package and screen payload contract

**Files:**
- Create: `packages/prototype/package.json`
- Create: `packages/prototype/tsconfig.json`
- Create: `packages/prototype/src/screen-payload.ts`
- Create: `packages/prototype/src/index.ts`
- Test: `packages/prototype/src/screen-payload.test.ts`

**Interfaces:**
- Consumes: `MAX_RESULT_BYTES` from `@meld/contracts` (for the headroom assertion only).
- Produces: `DesignScreenActionSchema`, `DesignScreenPayloadSchema`, types `DesignScreenAction` and `DesignScreenPayload`, and the constants `MAX_SCREEN_MARKUP_BYTES`, `MAX_SCREEN_STYLES_BYTES`, `MAX_SCREEN_SCRIPT_BYTES`, `MAX_SCREEN_ACTIONS`.

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "@meld/prototype",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "lint": "eslint",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@meld/contracts": "workspace:*",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@eslint/js": "9.39.5",
    "eslint": "9.39.5",
    "typescript": "5.9.3",
    "typescript-eslint": "8.65.0"
  }
}
```

- [ ] **Step 2: Create the tsconfig**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Install so the workspace picks up the new package**

Run: `pnpm install`
Expected: `packages/prototype` appears in the workspace; no lockfile errors. `pnpm-workspace.yaml` already globs `packages/*` and `vitest.workspace.ts` already globs `packages/*`, so neither file needs editing.

- [ ] **Step 4: Write the failing test**

Create `packages/prototype/src/screen-payload.test.ts`:

```ts
import { MAX_RESULT_BYTES } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import {
  DesignScreenPayloadSchema,
  MAX_SCREEN_ACTIONS,
  MAX_SCREEN_MARKUP_BYTES,
  MAX_SCREEN_SCRIPT_BYTES,
  MAX_SCREEN_STYLES_BYTES,
} from "./screen-payload";

function validPayload() {
  return {
    markup: '<button data-meld-action="continue">Continue</button>',
    styles: "button { color: var(--meld-color-primary); }",
    script: null,
    actions: [
      {
        id: "continue",
        label: "Continue",
        targetScreenId: "9f3c1c62-0a1e-4f5e-9d2a-6b7c8d9e0f10",
      },
    ],
  };
}

describe("DesignScreenPayloadSchema", () => {
  it("accepts a minimal screen", () => {
    expect(DesignScreenPayloadSchema.parse(validPayload()).actions).toHaveLength(1);
  });

  it("allows a null target so an unbuilt destination is representable", () => {
    const payload = validPayload();
    payload.actions[0].targetScreenId = null;
    expect(DesignScreenPayloadSchema.parse(payload).actions[0].targetScreenId).toBeNull();
  });

  it("rejects duplicate action ids", () => {
    const payload = validPayload();
    payload.actions.push({ ...payload.actions[0] });
    expect(() => DesignScreenPayloadSchema.parse(payload)).toThrow("Duplicate action id");
  });

  it("rejects markup past its byte budget", () => {
    const payload = validPayload();
    payload.markup = "x".repeat(MAX_SCREEN_MARKUP_BYTES + 1);
    expect(() => DesignScreenPayloadSchema.parse(payload)).toThrow();
  });

  it("measures budgets in UTF-8 bytes, not code units", () => {
    const payload = validPayload();
    // Four bytes each, so half the limit in characters is exactly the limit.
    payload.markup = "𝄞".repeat(MAX_SCREEN_MARKUP_BYTES / 4);
    expect(() => DesignScreenPayloadSchema.parse(payload)).not.toThrow();
    payload.markup = "𝄞".repeat(MAX_SCREEN_MARKUP_BYTES / 4 + 1);
    expect(() => DesignScreenPayloadSchema.parse(payload)).toThrow();
  });

  it("rejects more actions than the cap", () => {
    const payload = validPayload();
    payload.actions = Array.from({ length: MAX_SCREEN_ACTIONS + 1 }, (_, index) => ({
      id: `action-${index}`,
      label: "Go",
      targetScreenId: null,
    }));
    expect(() => DesignScreenPayloadSchema.parse(payload)).toThrow();
  });

  it("leaves headroom inside the connector result cap", () => {
    const contentBudget =
      MAX_SCREEN_MARKUP_BYTES + MAX_SCREEN_STYLES_BYTES + MAX_SCREEN_SCRIPT_BYTES;
    // Envelope, action list, and JSON escaping all ride in the same result.
    expect(contentBudget).toBeLessThanOrEqual(MAX_RESULT_BYTES * 0.7);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @meld/prototype test`
Expected: FAIL — `Cannot find module './screen-payload'`.

- [ ] **Step 6: Write the implementation**

Create `packages/prototype/src/screen-payload.ts`:

```ts
import { z } from "zod";

// 96 + 32 + 32 = 160 KiB of content, comfortably inside the connector's
// 256 KiB MAX_RESULT_BYTES once the JSON envelope and action list are added.
export const MAX_SCREEN_MARKUP_BYTES = 96 * 1024;
export const MAX_SCREEN_STYLES_BYTES = 32 * 1024;
export const MAX_SCREEN_SCRIPT_BYTES = 32 * 1024;
export const MAX_SCREEN_ACTIONS = 40;

const encoder = new TextEncoder();

// Budgets are in bytes because that is what the transport caps, and a string's
// length is not its size once the model emits an emoji or a curly quote.
function byteLength(value: string): number {
  return encoder.encode(value).length;
}

function bounded(limit: number) {
  return z.string().refine((value) => byteLength(value) <= limit, {
    message: `exceeds ${limit} bytes`,
  });
}

export const DesignScreenActionSchema = z
  .object({
    // Stable and opaque: markup references it as data-meld-action, so it must
    // survive a screen rename.
    id: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/),
    label: z.string().trim().min(1).max(80),
    // Null means "not built yet" — a legal state, not a validation failure.
    targetScreenId: z.string().uuid().nullable(),
  })
  .strict();
export type DesignScreenAction = z.infer<typeof DesignScreenActionSchema>;

export const DesignScreenPayloadSchema = z
  .object({
    markup: bounded(MAX_SCREEN_MARKUP_BYTES),
    styles: bounded(MAX_SCREEN_STYLES_BYTES),
    // Script is a separate field so it is never parsed out of markup, and so
    // the assembler injects it under its own control.
    script: bounded(MAX_SCREEN_SCRIPT_BYTES).nullable(),
    actions: z.array(DesignScreenActionSchema).max(MAX_SCREEN_ACTIONS),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const seen = new Set<string>();
    for (const [index, action] of payload.actions.entries()) {
      if (seen.has(action.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate action id: ${action.id}`,
          path: ["actions", index, "id"],
        });
      }
      seen.add(action.id);
    }
  });
export type DesignScreenPayload = z.infer<typeof DesignScreenPayloadSchema>;
```

Create `packages/prototype/src/index.ts`:

```ts
export * from "./screen-payload";
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm --filter @meld/prototype test && pnpm --filter @meld/prototype typecheck`
Expected: all tests PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/prototype pnpm-lock.yaml
git commit -m "feat(prototype): add screen payload contract with byte budgets"
```

---

### Task 2: Screen safety rejection scan

The sandbox is the security boundary. This scan is defence in depth and a
quality gate: it makes a model that emits a remote script a **task failure**
with a named reason, rather than a screen that silently loses a feature at
render time. It rejects; it never rewrites.

**Files:**
- Create: `packages/prototype/src/screen-safety.ts`
- Modify: `packages/prototype/src/index.ts`
- Test: `packages/prototype/src/screen-safety.test.ts`

**Interfaces:**
- Consumes: `DesignScreenPayload` from Task 1.
- Produces: `findScreenSafetyViolations(payload: DesignScreenPayload): ScreenSafetyFinding[]`, types `ScreenSafetyFinding` (`{ rule: ScreenSafetyRule; detail: string }`) and `ScreenSafetyRule`.

- [ ] **Step 1: Write the failing test**

Create `packages/prototype/src/screen-safety.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DesignScreenPayload } from "./screen-payload";
import { findScreenSafetyViolations } from "./screen-safety";

function payload(overrides: Partial<DesignScreenPayload> = {}): DesignScreenPayload {
  return {
    markup: "<section><p>Hello</p></section>",
    styles: "p { color: var(--meld-color-text); }",
    script: null,
    actions: [],
    ...overrides,
  } as DesignScreenPayload;
}

function rules(input: DesignScreenPayload): string[] {
  return findScreenSafetyViolations(input).map((finding) => finding.rule);
}

describe("findScreenSafetyViolations", () => {
  it("passes a clean screen", () => {
    expect(findScreenSafetyViolations(payload())).toEqual([]);
  });

  it.each([
    ["<base href='https://evil.test/'>", "forbidden-element"],
    ["<meta http-equiv='refresh' content='0'>", "forbidden-element"],
    ["<link rel='stylesheet' href='https://evil.test/a.css'>", "forbidden-element"],
    ["<iframe src='https://evil.test'></iframe>", "forbidden-element"],
    ["<object data='https://evil.test'></object>", "forbidden-element"],
    ["<embed src='https://evil.test'>", "forbidden-element"],
    ["<form action='https://evil.test'></form>", "forbidden-element"],
    ["<script>alert(1)</script>", "forbidden-element"],
  ])("rejects %s", (markup, rule) => {
    expect(rules(payload({ markup }))).toContain(rule);
  });

  it("rejects a remote URL in an attribute", () => {
    expect(rules(payload({ markup: "<img src='https://evil.test/a.png'>" }))).toContain(
      "remote-url",
    );
  });

  it("rejects a protocol-relative URL", () => {
    expect(rules(payload({ markup: "<img src='//evil.test/a.png'>" }))).toContain(
      "remote-url",
    );
  });

  it("allows a data: image", () => {
    expect(
      findScreenSafetyViolations(payload({ markup: "<img src='data:image/png;base64,AA=='>" })),
    ).toEqual([]);
  });

  it("rejects a remote url() in styles", () => {
    expect(rules(payload({ styles: "body { background: url(https://evil.test/x.png); }" }))).toContain(
      "remote-url",
    );
  });

  it("rejects @import in styles", () => {
    expect(rules(payload({ styles: "@import url(https://evil.test/x.css);" }))).toContain(
      "remote-url",
    );
  });

  it.each([
    ["import('https://evil.test/x.js')", "module-import"],
    ["importScripts('/x.js')", "module-import"],
    ["new Worker('/w.js')", "worker"],
    ["new SharedWorker('/w.js')", "worker"],
    ["navigator.serviceWorker.register('/sw.js')", "worker"],
    ["top.location = 'https://evil.test'", "navigation-api"],
    ["window.location.replace('https://evil.test')", "navigation-api"],
    ["window.open('https://evil.test')", "navigation-api"],
  ])("rejects script using %s", (script, rule) => {
    expect(rules(payload({ script }))).toContain(rule);
  });

  it("reports every violation rather than stopping at the first", () => {
    const findings = findScreenSafetyViolations(
      payload({ markup: "<iframe></iframe><img src='https://evil.test/a.png'>" }),
    );
    expect(findings.map((finding) => finding.rule).sort()).toEqual([
      "forbidden-element",
      "remote-url",
    ]);
  });

  it("names the offending construct in the detail", () => {
    const [finding] = findScreenSafetyViolations(payload({ markup: "<iframe></iframe>" }));
    expect(finding.detail).toContain("iframe");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @meld/prototype test screen-safety`
Expected: FAIL — `Cannot find module './screen-safety'`.

- [ ] **Step 3: Write the implementation**

Create `packages/prototype/src/screen-safety.ts`:

```ts
import type { DesignScreenPayload } from "./screen-payload";

export type ScreenSafetyRule =
  | "forbidden-element"
  | "remote-url"
  | "module-import"
  | "worker"
  | "navigation-api";

export type ScreenSafetyFinding = {
  rule: ScreenSafetyRule;
  detail: string;
};

// A screen is a fragment, not a document: none of these belong in one, and the
// alternative to rejecting them is trusting a text scan to neutralise them.
// Rejecting is the whole point — this never rewrites a screen.
const FORBIDDEN_ELEMENTS = [
  "base",
  "meta",
  "link",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "form",
  "script",
] as const;

// Any scheme-qualified or protocol-relative URL. data: is the sole exception:
// images and fonts must be inlined.
const REMOTE_URL = /(?:\b[a-z][a-z0-9+.-]*:)?\/\/[^\s"')]+/gi;
const DATA_URL = /^data:/i;

const SCRIPT_RULES: ReadonlyArray<{ rule: ScreenSafetyRule; pattern: RegExp }> = [
  { rule: "module-import", pattern: /\bimport\s*[(]|\bimportScripts\s*\(/ },
  {
    rule: "worker",
    pattern: /\bnew\s+(?:Shared)?Worker\s*\(|navigator\s*\.\s*serviceWorker/,
  },
  {
    rule: "navigation-api",
    pattern:
      /\b(?:top|parent|window|document|self)?\s*\.?\s*location\s*(?:=|\.\s*(?:href|assign|replace))|\bwindow\s*\.\s*open\s*\(|\bhistory\s*\.\s*(?:pushState|replaceState)\s*\(/,
  },
];

function findRemoteUrls(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(REMOTE_URL)) {
    if (DATA_URL.test(match[0])) continue;
    found.push(match[0]);
  }
  return found;
}

export function findScreenSafetyViolations(
  payload: DesignScreenPayload,
): ScreenSafetyFinding[] {
  const findings: ScreenSafetyFinding[] = [];

  for (const element of FORBIDDEN_ELEMENTS) {
    if (new RegExp(`<\\s*${element}\\b`, "i").test(payload.markup)) {
      findings.push({
        rule: "forbidden-element",
        detail: `<${element}> is not allowed in a screen`,
      });
    }
  }

  for (const url of [
    ...findRemoteUrls(payload.markup),
    ...findRemoteUrls(payload.styles),
  ]) {
    findings.push({ rule: "remote-url", detail: `remote reference: ${url}` });
  }

  if (/@import\b/i.test(payload.styles)) {
    findings.push({ rule: "remote-url", detail: "@import is not allowed in styles" });
  }

  if (payload.script) {
    for (const { rule, pattern } of SCRIPT_RULES) {
      if (pattern.test(payload.script)) {
        findings.push({ rule, detail: `script uses ${pattern.source}` });
      }
    }
  }

  return findings;
}
```

Append to `packages/prototype/src/index.ts`:

```ts
export * from "./screen-safety";
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/prototype test && pnpm --filter @meld/prototype typecheck`
Expected: PASS.

Note the `@import` case produces two findings (the `//` in the URL and the `@import` rule). The "reports every violation" test uses a case with exactly two distinct rules, so this is expected; do not deduplicate.

- [ ] **Step 5: Commit**

```bash
git add packages/prototype/src
git commit -m "feat(prototype): reject unsafe constructs in generated screens"
```

---

### Task 3: Prototype document assembler

**Files:**
- Create: `packages/prototype/src/prototype-document.ts`
- Modify: `packages/prototype/src/index.ts`
- Test: `packages/prototype/src/prototype-document.test.ts`

**Interfaces:**
- Consumes: `DesignScreenAction` from Task 1.
- Produces: `buildPrototypeDocument(input: PrototypeDocumentInput): string` and the types `PrototypeScreen` (`{ id: string; name: string; markup: string; styles: string; script: string | null; actions: DesignScreenAction[] }`) and `PrototypeDocumentInput` (`{ screens: PrototypeScreen[]; startScreenId: string; tokenCss: string }`). Also exports `PROTOTYPE_CSP`.

Design notes the implementer needs:

- Screens live in one document as `<section data-meld-screen="ID" hidden>`.
- Each screen's styles are wrapped in a CSS nesting block scoped to its own section, so two screens cannot collide. `@keyframes` and `@font-face` are invalid inside a style rule, so they are hoisted to the top level first.
- The route table is embedded as `<script type="application/json">`, which is data, not code. `<` is escaped as `\u003c` so a label containing `</script>` cannot break out.
- Meld owns click handling. Screen names never appear in routing.

- [ ] **Step 1: Write the failing test**

Create `packages/prototype/src/prototype-document.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildPrototypeDocument, PROTOTYPE_CSP } from "./prototype-document";

const SIGN_UP = "11111111-1111-4111-8111-111111111111";
const DASHBOARD = "22222222-2222-4222-8222-222222222222";

function input() {
  return {
    startScreenId: SIGN_UP,
    tokenCss: ":root { --meld-color-primary: #2f6feb; }",
    screens: [
      {
        id: SIGN_UP,
        name: "Sign up",
        markup: '<button data-meld-action="go">Continue</button>',
        styles: "button { padding: 8px; }",
        script: null,
        actions: [{ id: "go", label: "Continue", targetScreenId: DASHBOARD }],
      },
      {
        id: DASHBOARD,
        name: "Dashboard",
        markup: "<h1>Dashboard</h1>",
        styles: "h1 { font-size: 24px; }",
        script: null,
        actions: [],
      },
    ],
  };
}

describe("buildPrototypeDocument", () => {
  it("is deterministic for identical input", () => {
    expect(buildPrototypeDocument(input())).toBe(buildPrototypeDocument(input()));
  });

  it("embeds the locked-down CSP", () => {
    expect(buildPrototypeDocument(input())).toContain(PROTOTYPE_CSP);
    expect(PROTOTYPE_CSP).toContain("default-src 'none'");
    expect(PROTOTYPE_CSP).toContain("connect-src 'none'");
    expect(PROTOTYPE_CSP).toContain("form-action 'none'");
    expect(PROTOTYPE_CSP).toContain("base-uri 'none'");
  });

  it("shows only the start screen", () => {
    const html = buildPrototypeDocument(input());
    expect(html).toContain(`<section data-meld-screen="${SIGN_UP}">`);
    expect(html).toContain(`<section data-meld-screen="${DASHBOARD}" hidden>`);
  });

  it("scopes each screen's styles to its own section", () => {
    const html = buildPrototypeDocument(input());
    expect(html).toContain(`[data-meld-screen="${SIGN_UP}"] { button { padding: 8px; } }`);
    expect(html).toContain(`[data-meld-screen="${DASHBOARD}"] { h1 { font-size: 24px; } }`);
  });

  it("hoists @keyframes out of the scoping block, where it would be invalid", () => {
    const document = input();
    document.screens[0].styles = "@keyframes pulse { from { opacity: 0; } } p { opacity: 1; }";
    const html = buildPrototypeDocument(document);
    expect(html).toContain("@keyframes pulse { from { opacity: 0; } }");
    expect(html).not.toContain(`[data-meld-screen="${SIGN_UP}"] { @keyframes`);
    expect(html).toContain(`[data-meld-screen="${SIGN_UP}"] { p { opacity: 1; } }`);
  });

  it("maps actions to target screens by id, never by name", () => {
    const html = buildPrototypeDocument(input());
    expect(html).toContain(`"go":"${DASHBOARD}"`);
    expect(html).not.toContain('"Continue":');
  });

  it("emits a null target rather than dropping the action", () => {
    const document = input();
    document.screens[0].actions[0].targetScreenId = null;
    expect(buildPrototypeDocument(document)).toContain('"go":null');
  });

  it("escapes a label that tries to close the json block", () => {
    const document = input();
    document.screens[0].actions[0].label = "</script><script>alert(1)</script>";
    const html = buildPrototypeDocument(document);
    expect(html).not.toContain("</script><script>alert(1)");
    expect(html).toContain("\\u003c/script");
  });

  it("throws when the start screen is not in the set", () => {
    const document = input();
    document.startScreenId = "33333333-3333-4333-8333-333333333333";
    expect(() => buildPrototypeDocument(document)).toThrow("Unknown start screen");
  });

  it("wraps each screen's script so one screen's error cannot stop another", () => {
    const document = input();
    document.screens[0].script = "throw new Error('boom')";
    expect(buildPrototypeDocument(document)).toContain("try {");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @meld/prototype test prototype-document`
Expected: FAIL — `Cannot find module './prototype-document'`.

- [ ] **Step 3: Write the implementation**

Create `packages/prototype/src/prototype-document.ts`:

```ts
import type { DesignScreenAction } from "./screen-payload";

export type PrototypeScreen = {
  id: string;
  name: string;
  markup: string;
  styles: string;
  script: string | null;
  actions: DesignScreenAction[];
};

export type PrototypeDocumentInput = {
  screens: PrototypeScreen[];
  startScreenId: string;
  tokenCss: string;
};

// Belt to the sandbox attribute's braces. connect-src 'none' stops fetch, XHR,
// WebSocket, and EventSource; img-src data: stops beacons; form-action and
// base-uri close the two navigation tricks that do not need script.
export const PROTOTYPE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
].join("; ");

// @keyframes and @font-face are invalid inside a style rule, so they cannot ride
// the nesting block that scopes everything else to one screen.
const HOISTED_AT_RULE = /@(?:keyframes|font-face)\b/gi;

function splitHoistedAtRules(styles: string): { hoisted: string; scoped: string } {
  const hoisted: string[] = [];
  let scoped = "";
  let cursor = 0;

  HOISTED_AT_RULE.lastIndex = 0;
  for (let match = HOISTED_AT_RULE.exec(styles); match; match = HOISTED_AT_RULE.exec(styles)) {
    const start = match.index;
    const open = styles.indexOf("{", start);
    if (open === -1) break;

    let depth = 0;
    let end = open;
    for (; end < styles.length; end += 1) {
      if (styles[end] === "{") depth += 1;
      else if (styles[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }

    scoped += styles.slice(cursor, start);
    hoisted.push(styles.slice(start, end + 1));
    cursor = end + 1;
    HOISTED_AT_RULE.lastIndex = cursor;
  }

  scoped += styles.slice(cursor);
  return { hoisted: hoisted.join("\n"), scoped: scoped.trim() };
}

// The route table is data, not code. Escaping `<` means a label can never close
// the block it lives in.
function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

const HARNESS = `
(function () {
  var routes = JSON.parse(document.getElementById("meld-routes").textContent);
  var screens = Array.prototype.slice.call(
    document.querySelectorAll("[data-meld-screen]")
  );

  function show(id) {
    var found = false;
    screens.forEach(function (screen) {
      var match = screen.getAttribute("data-meld-screen") === id;
      screen.hidden = !match;
      if (match) found = true;
    });
    if (found) document.body.setAttribute("data-meld-current", id);
    return found;
  }

  document.addEventListener("click", function (event) {
    var node = event.target;
    while (node && node !== document.body && !node.hasAttribute("data-meld-action")) {
      node = node.parentElement;
    }
    if (!node || node === document.body) return;
    event.preventDefault();

    var action = node.getAttribute("data-meld-action");
    var target = Object.prototype.hasOwnProperty.call(routes, action)
      ? routes[action]
      : null;
    if (target === null) {
      document.body.setAttribute("data-meld-unresolved", action);
      return;
    }
    document.body.removeAttribute("data-meld-unresolved");
    show(target);
  });

  show(document.body.getAttribute("data-meld-start"));
})();
`.trim();

export function buildPrototypeDocument(input: PrototypeDocumentInput): string {
  if (!input.screens.some((screen) => screen.id === input.startScreenId)) {
    throw new Error(`Unknown start screen: ${input.startScreenId}`);
  }

  const routes: Record<string, string | null> = {};
  for (const screen of input.screens) {
    for (const action of screen.actions) {
      routes[action.id] = action.targetScreenId;
    }
  }

  const hoisted: string[] = [];
  const scoped: string[] = [];
  for (const screen of input.screens) {
    const split = splitHoistedAtRules(screen.styles);
    if (split.hoisted) hoisted.push(split.hoisted);
    if (split.scoped) {
      scoped.push(`[data-meld-screen="${screen.id}"] { ${split.scoped} }`);
    }
  }

  const sections = input.screens.map((screen) => {
    const hidden = screen.id === input.startScreenId ? "" : " hidden";
    return `<section data-meld-screen="${screen.id}" aria-label="${escapeAttribute(
      screen.name,
    )}"${hidden}>${screen.markup}</section>`;
  });

  // One screen's script throwing must not stop the others from wiring up.
  const scripts = input.screens
    .filter((screen) => screen.script)
    .map((screen) => `try { ${screen.script} } catch (error) { /* screen ${screen.id} */ }`);

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${PROTOTYPE_CSP}">`,
    `<style>${input.tokenCss}</style>`,
    hoisted.length ? `<style>${hoisted.join("\n")}</style>` : "",
    scoped.length ? `<style>${scoped.join("\n")}</style>` : "",
    "</head>",
    `<body data-meld-start="${input.startScreenId}">`,
    ...sections,
    `<script type="application/json" id="meld-routes">${embedJson(routes)}</script>`,
    `<script>${HARNESS}</script>`,
    scripts.length ? `<script>${scripts.join("\n")}</script>` : "",
    "</body>",
    "</html>",
  ]
    .filter(Boolean)
    .join("\n");
}
```

Append to `packages/prototype/src/index.ts`:

```ts
export * from "./prototype-document";
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/prototype test && pnpm --filter @meld/prototype typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/prototype/src
git commit -m "feat(prototype): assemble screens into one sandboxed document"
```

---

### Task 4: Prove the sandbox has no escape path

This is the task the whole slice exists for. It runs the real assembler output
in a real Chromium, and every escape attempt must fail. A capture server proves
the negative: if any request reaches it, the boundary leaks.

**Files:**
- Create: `playwright.sandbox.config.ts`
- Create: `e2e/prototype-sandbox.spec.ts`
- Modify: `package.json` (add the `test:e2e:sandbox` script)

**Interfaces:**
- Consumes: `buildPrototypeDocument` and `PROTOTYPE_CSP` from Task 3.
- Produces: nothing importable — its output is evidence.

- [ ] **Step 1: Create the standalone Playwright config**

The default `playwright.config.ts` boots `next dev` and a Supabase global setup.
This spec needs neither: it drives `page.setContent` only.

```ts
import { defineConfig, devices } from "@playwright/test";

// Deliberately no webServer and no globalSetup: the sandbox proof needs a
// browser and nothing else, so it stays runnable when the stack is down.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "prototype-sandbox.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["line"]] : "list",
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
});
```

- [ ] **Step 2: Add the run script and the root workspace dependency**

Playwright specs run from the repo root and resolve workspace packages through
root `devDependencies` — that is how `e2e/user-flow-trial.spec.ts` imports
`@meld/device-auth`. Without this entry the spec cannot import
`@meld/prototype`.

In root `package.json`, beside the existing `test:e2e` entry:

```json
"test:e2e:sandbox": "playwright test --config playwright.sandbox.config.ts"
```

And in root `devDependencies`, beside `"@meld/device-auth"`:

```json
"@meld/prototype": "workspace:*"
```

Then run: `pnpm install`
Expected: the root package links `@meld/prototype`; no lockfile errors.

- [ ] **Step 3: Write the failing test**

Create `e2e/prototype-sandbox.spec.ts`:

```ts
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { buildPrototypeDocument } from "@meld/prototype";

const SCREEN_ID = "11111111-1111-4111-8111-111111111111";

let server: Server;
let captured: string[] = [];
let origin = "";

test.beforeAll(async () => {
  server = createServer((request, response) => {
    captured.push(request.url ?? "");
    response.writeHead(200, { "access-control-allow-origin": "*" });
    response.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  captured = [];
});

// Every attempt reports itself back through postMessage, which the sandbox does
// not block — that is how the test learns the outcome of code it cannot inspect.
function escapeScript(target: string): string {
  return `
    var results = [];
    function attempt(name, run) {
      try { run(); results.push({ name: name, threw: false }); }
      catch (error) { results.push({ name: name, threw: true }); }
    }
    attempt("fetch", function () { fetch("${target}/fetch"); });
    attempt("xhr", function () {
      var request = new XMLHttpRequest();
      request.open("GET", "${target}/xhr");
      request.send();
    });
    attempt("websocket", function () {
      new WebSocket("${target.replace("http", "ws")}/ws");
    });
    attempt("eventsource", function () { new EventSource("${target}/sse"); });
    attempt("beacon", function () {
      var image = document.createElement("img");
      image.src = "${target}/beacon.png";
      document.body.appendChild(image);
    });
    attempt("top-navigation", function () { top.location = "${target}/top"; });
    attempt("parent-dom", function () { void parent.document.title; });
    attempt("local-storage", function () { localStorage.setItem("k", "v"); });
    attempt("cookie", function () { document.cookie = "k=v"; });
    attempt("window-open", function () { window.open("${target}/popup"); });
    setTimeout(function () {
      parent.postMessage(JSON.stringify(results), "*");
    }, 250);
  `;
}

async function runEscapeMatrix(page: import("@playwright/test").Page) {
  const document = buildPrototypeDocument({
    startScreenId: SCREEN_ID,
    tokenCss: "",
    screens: [
      {
        id: SCREEN_ID,
        name: "Escape",
        markup: "<p>escape matrix</p>",
        styles: "",
        script: escapeScript(origin),
        actions: [],
      },
    ],
  });

  await page.setContent(`
    <!DOCTYPE html><html><body>
    <iframe id="frame" sandbox="allow-scripts"></iframe>
    <script>
      window.__results = null;
      addEventListener("message", function (event) { window.__results = event.data; });
      document.getElementById("frame").srcdoc = ${JSON.stringify(document)};
    </script>
    </body></html>
  `);

  await page.waitForFunction(() => (window as never as { __results: string | null }).__results !== null);
  return JSON.parse(
    await page.evaluate(() => (window as never as { __results: string }).__results),
  ) as Array<{ name: string; threw: boolean }>;
}

test("no escape attempt reaches the network", async ({ page }) => {
  await runEscapeMatrix(page);
  // Give any in-flight request time to land before asserting the negative.
  await page.waitForTimeout(500);
  expect(captured).toEqual([]);
});

test("storage, cookies, parent DOM, and top navigation all throw", async ({ page }) => {
  const results = await runEscapeMatrix(page);
  const byName = new Map(results.map((result) => [result.name, result.threw]));

  expect(byName.get("parent-dom")).toBe(true);
  expect(byName.get("local-storage")).toBe(true);
  expect(byName.get("top-navigation")).toBe(true);

  // Every attempt must have been made — a typo that skips one would otherwise
  // read as a pass.
  expect(results).toHaveLength(10);
});

test("an inert frame does not execute script at all", async ({ page }) => {
  const document = buildPrototypeDocument({
    startScreenId: SCREEN_ID,
    tokenCss: "",
    screens: [
      {
        id: SCREEN_ID,
        name: "Inert",
        markup: "<p>inert</p>",
        styles: "",
        script: `fetch("${origin}/inert"); document.title = "ran";`,
        actions: [],
      },
    ],
  });

  await page.setContent(`
    <!DOCTYPE html><html><body>
    <iframe id="frame" sandbox=""></iframe>
    <script>document.getElementById("frame").srcdoc = ${JSON.stringify(document)};</script>
    </body></html>
  `);
  await page.waitForTimeout(750);

  expect(captured).toEqual([]);
  expect(await page.frameLocator("#frame").locator("p").innerText()).toBe("inert");
});

test("routing works inside the sandbox", async ({ page }) => {
  const second = "22222222-2222-4222-8222-222222222222";
  const document = buildPrototypeDocument({
    startScreenId: SCREEN_ID,
    tokenCss: "",
    screens: [
      {
        id: SCREEN_ID,
        name: "First",
        markup: '<button data-meld-action="go">Continue</button>',
        styles: "",
        script: null,
        actions: [{ id: "go", label: "Continue", targetScreenId: second }],
      },
      {
        id: second,
        name: "Second",
        markup: "<h1>Second screen</h1>",
        styles: "",
        script: null,
        actions: [],
      },
    ],
  });

  await page.setContent(`
    <!DOCTYPE html><html><body>
    <iframe id="frame" sandbox="allow-scripts" width="800" height="600"></iframe>
    <script>document.getElementById("frame").srcdoc = ${JSON.stringify(document)};</script>
    </body></html>
  `);

  const frame = page.frameLocator("#frame");
  await expect(frame.locator("h1")).toBeHidden();
  await frame.locator("button").click();
  await expect(frame.locator("h1")).toHaveText("Second screen");
});
```

- [ ] **Step 4: Run it and record what actually happens**

Run: `pnpm test:e2e:sandbox`

Expected: PASS. If any assertion fails, **that is the spike's most valuable
result** — do not weaken the test. Record the exact failure in the findings
report (Task 8) and stop for a design decision. In particular:

- If a request reaches the capture server, the CSP or sandbox flags are wrong.
- If `window.open` succeeds, `allow-popups` is being inherited from somewhere.
- If the routing test fails, the harness needs fixing before slice 2 depends on it.

- [ ] **Step 5: Commit**

```bash
git add playwright.sandbox.config.ts e2e/prototype-sandbox.spec.ts package.json
git commit -m "test(prototype): prove the sandbox has no escape path"
```

---

### Task 5: Prove a screen frame rides the default tldraw schema

The design claims a screen can be a built-in `frame` shape carrying
`meta.meldScreenId`, avoiding a custom shape type shared between web and
gateway. This proves the meta survives validation, the permissive record
authorizers, SQLite persistence, and a reopen.

**Files:**
- Modify: `apps/gateway/src/canvas/sqlite-canvas-room.ts` (add `insertScreenFrame` beside `insertServerMarker`)
- Test: `apps/gateway/src/canvas/sqlite-canvas-room.test.ts`

**Interfaces:**
- Produces: `SqliteCanvasRoom.insertScreenFrame(meldScreenId: string): ServerMarkerResult` — same return shape as the existing `insertServerMarker`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe("SqliteCanvasRoom", ...)` block in
`apps/gateway/src/canvas/sqlite-canvas-room.test.ts`:

```ts
  it("persists a screen frame and its meldScreenId across a reopen", async () => {
    const { room, databasePath } = await createRoom();
    const screenId = "11111111-1111-4111-8111-111111111111";

    const frame = room.insertScreenFrame(screenId);
    expect(frame.recordId).toMatch(/^shape:/);

    const shapes = room
      .getSnapshot()
      .documents.filter((document) => document.state.typeName === "shape");
    expect(shapes).toHaveLength(1);
    expect(shapes[0].state).toMatchObject({
      type: "frame",
      meta: { meldScreenId: screenId },
    });
    room.close();

    const reopened = new SqliteCanvasRoom({
      workspaceId: WORKSPACE_ID,
      roomId: ROOM_ID,
      databasePath,
    });
    const persisted = reopened
      .getSnapshot()
      .documents.filter((document) => document.state.typeName === "shape");
    expect(persisted[0].state).toMatchObject({
      type: "frame",
      meta: { meldScreenId: screenId },
    });
    reopened.close();
  });

  it("keeps screen frames distinguishable from ordinary shapes", async () => {
    const { room } = await createRoom();
    room.insertServerMarker("ordinary");
    room.insertScreenFrame("22222222-2222-4222-8222-222222222222");

    const withScreenId = room
      .getSnapshot()
      .documents.filter(
        (document) =>
          document.state.typeName === "shape" &&
          typeof (document.state as { meta?: Record<string, unknown> }).meta
            ?.meldScreenId === "string",
      );
    expect(withScreenId).toHaveLength(1);
    room.close();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @meld/gateway test sqlite-canvas-room`
Expected: FAIL — `room.insertScreenFrame is not a function`.

- [ ] **Step 3: Implement `insertScreenFrame`**

In `apps/gateway/src/canvas/sqlite-canvas-room.ts`, directly below
`insertServerMarker`. Import `TLFrameShape` from `@tldraw/tlschema` alongside
the existing `TLGeoShape` import.

```ts
  /**
   * A design screen is a built-in `frame` shape carrying its Supabase row id in
   * `meta`. Deliberately not a custom shape type: the gateway builds its schema
   * with bare `createTLSchema()`, so a custom type would have to be shared by
   * both processes and migrated into existing rooms.
   */
  insertScreenFrame(meldScreenId: string): ServerMarkerResult {
    if (this.closed) throw new Error("Canvas room is closed");
    const page = this.getSnapshot().documents.find(
      (document) => document.state.typeName === "page",
    );
    if (!page) throw new Error("Canvas room has no persisted page");

    const recordId = createShapeId(`screen-${meldScreenId}`);
    const frame: TLFrameShape = {
      id: recordId,
      typeName: "shape",
      type: "frame",
      x: 0,
      y: 0,
      rotation: 0,
      index: "a3" as TLFrameShape["index"],
      parentId: page.state.id as TLFrameShape["parentId"],
      isLocked: false,
      opacity: 1,
      props: { w: 390, h: 844, name: "", color: "black" },
      meta: { meldScreenId },
    };

    const result = this.storage.transaction(
      (txn) => {
        txn.set(recordId, frame);
        return recordId;
      },
      { id: "design:screen-frame", emitChanges: "always" },
    );
    this.auditProbe.recordServerCommit({
      workspaceId: this.options.workspaceId,
      roomId: this.options.roomId,
      documentClock: result.documentClock,
      touchedRecordIds: [recordId],
    });
    return { documentClock: result.documentClock, recordId };
  }
```

If `tsc` rejects any entry in `props`, take the exact shape from `TLFrameShape`
in `@tldraw/tlschema@5.3.0` and satisfy it. The prop list is incidental; the
`meta` round-trip is what this task proves.

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @meld/gateway test sqlite-canvas-room && pnpm --filter @meld/gateway typecheck`
Expected: PASS.

If the schema rejects `meta.meldScreenId`, stop: the design's representation
decision is wrong and slice 3 needs a different approach. Record it in Task 8.

- [ ] **Step 5: Commit**

```bash
git add apps/gateway/src/canvas
git commit -m "feat(canvas): represent a design screen as a frame carrying its row id"
```

---

### Task 6: Verify Figma's oEmbed endpoint

The design assumes `https://www.figma.com/api/oembed` returns a usable
`thumbnail_url` for a link-shared file, with no OAuth. That has never been
tested from this codebase. This script follows the existing
`scripts/provider-adapters/live-smoke.mjs` pattern: a self-test that runs in CI
against a local fake, and a live mode behind an explicit flag.

**Files:**
- Create: `scripts/design/figma-oembed-check.mjs`
- Test: `scripts/design/figma-oembed-check.test.mjs`
- Modify: `package.json` (add `check:figma-oembed` and `test:figma-oembed`)

**Interfaces:**
- Produces: exported functions `normalizeFigmaUrl(input: string): string | null` and `fetchOembed(url: string, options: { origin?: string; timeoutMs?: number }): Promise<{ ok: boolean; thumbnailUrl: string | null; title: string | null; status: number | string }>`.

- [ ] **Step 1: Write the failing test**

Create `scripts/design/figma-oembed-check.test.mjs`:

```js
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { fetchOembed, normalizeFigmaUrl } from "./figma-oembed-check.mjs";

test("normalizes a figma url and keeps only node-id", () => {
  assert.equal(
    normalizeFigmaUrl("https://WWW.Figma.com/design/abc123/Title?node-id=1-2&t=xyz#frame"),
    "https://www.figma.com/design/abc123/Title?node-id=1-2",
  );
});

test("accepts the bare figma.com host", () => {
  assert.equal(
    normalizeFigmaUrl("https://figma.com/file/abc123/Title"),
    "https://figma.com/file/abc123/Title",
  );
});

test("rejects a non-figma host", () => {
  assert.equal(normalizeFigmaUrl("https://figma.com.evil.test/file/abc"), null);
  assert.equal(normalizeFigmaUrl("https://notfigma.com/file/abc"), null);
});

test("rejects a non-https scheme", () => {
  assert.equal(normalizeFigmaUrl("http://www.figma.com/file/abc"), null);
});

test("reads a thumbnail from an oembed response", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ title: "Pricing", thumbnail_url: "https://s3.figma.test/t.png" }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const result = await fetchOembed("https://www.figma.com/file/abc/Title", { origin });
  assert.equal(result.ok, true);
  assert.equal(result.thumbnailUrl, "https://s3.figma.test/t.png");
  assert.equal(result.title, "Pricing");
  server.close();
});

test("reports a private file as not-ok without throwing", async () => {
  const server = createServer((request, response) => {
    response.writeHead(404, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const result = await fetchOembed("https://www.figma.com/file/private/Title", { origin });
  assert.equal(result.ok, false);
  assert.equal(result.thumbnailUrl, null);
  assert.equal(result.status, 404);
  server.close();
});

test("refuses a response past the size limit", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ title: "x".repeat(70 * 1024) }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const result = await fetchOembed("https://www.figma.com/file/big/Title", { origin });
  assert.equal(result.ok, false);
  assert.equal(result.status, "too-large");
  server.close();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/design/figma-oembed-check.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write the implementation**

Create `scripts/design/figma-oembed-check.mjs`:

```js
// Verifies the one third-party assumption in the Design Room design: that
// Figma's public oEmbed endpoint returns a usable thumbnail with no OAuth.
// Self-test mode runs against a local fake; --live hits figma.com.

const ALLOWED_HOSTS = new Set(["figma.com", "www.figma.com"]);
const MAX_RESPONSE_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 5_000;
const FIGMA_ORIGIN = "https://www.figma.com";

export function normalizeFigmaUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) return null;

  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  const nodeId = url.searchParams.get("node-id");
  url.search = "";
  if (nodeId) url.searchParams.set("node-id", nodeId);
  return url.toString();
}

export async function fetchOembed(figmaUrl, options = {}) {
  const origin = options.origin ?? FIGMA_ORIGIN;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const endpoint = `${origin}/api/oembed?url=${encodeURIComponent(figmaUrl)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      redirect: "error",
    });
    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) {
      return { ok: false, thumbnailUrl: null, title: null, status: "too-large" };
    }
    if (!response.ok) {
      return { ok: false, thumbnailUrl: null, title: null, status: response.status };
    }
    const parsed = JSON.parse(body);
    return {
      ok: typeof parsed.thumbnail_url === "string",
      thumbnailUrl: typeof parsed.thumbnail_url === "string" ? parsed.thumbnail_url : null,
      title: typeof parsed.title === "string" ? parsed.title : null,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      thumbnailUrl: null,
      title: null,
      status: error.name === "AbortError" ? "timeout" : "error",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const live = process.argv.includes("--live");
  if (!live) {
    console.log("Self-test only. Pass --live <figma-url> to probe figma.com.");
    return;
  }
  const target = process.argv[process.argv.indexOf("--live") + 1];
  const normalized = normalizeFigmaUrl(target ?? "");
  if (!normalized) {
    console.error(`Not an allowed Figma URL: ${target}`);
    process.exitCode = 1;
    return;
  }
  const result = await fetchOembed(normalized);
  console.log(JSON.stringify({ normalized, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
```

- [ ] **Step 4: Add the scripts**

In root `package.json`:

```json
"check:figma-oembed": "node scripts/design/figma-oembed-check.mjs",
"test:figma-oembed": "node --test scripts/design/figma-oembed-check.test.mjs"
```

- [ ] **Step 5: Run the self-test**

Run: `pnpm test:figma-oembed`
Expected: all tests PASS.

- [ ] **Step 6: Run the live probe and record the result**

Run: `node scripts/design/figma-oembed-check.mjs --live "<a real link-shared Figma file URL>"`

You need a Figma file with link sharing enabled. Record the exact JSON output
in Task 8 — including a failure. If `thumbnail_url` is absent or the endpoint
requires auth, the Figma lane degrades to plain link cards and slice 4 changes
scope. Nothing else in the design is affected.

- [ ] **Step 7: Commit**

```bash
git add scripts/design package.json
git commit -m "test(design): verify Figma oEmbed returns a usable thumbnail"
```

---

### Task 7: Measure the canvas overlay against camera movement

The design renders a screen preview as a DOM overlay anchored to a frame
shape's bounds, because a tldraw shape that hosts an iframe would need a custom
shape type. Whether that overlay keeps up with panning and zooming is unproven,
and the fallback (a stored static image) has a very different cost.

**Files:**
- Create: `e2e/prototype-overlay.spec.ts`
- Modify: `playwright.sandbox.config.ts` (widen `testMatch`)

**Interfaces:**
- Consumes: `buildPrototypeDocument` from Task 3.
- Produces: a recorded measurement, not code.

- [ ] **Step 1: Widen the config's testMatch**

```ts
  testMatch: /prototype-(sandbox|overlay)\.spec\.ts/,
```

- [ ] **Step 2: Write the measurement**

This deliberately does not boot the app. It reproduces the mechanism — an
absolutely-positioned iframe whose transform is driven by a simulated camera —
and measures drift and frame cost. A real tldraw canvas can only be slower, so
a failure here kills the approach outright.

Create `e2e/prototype-overlay.spec.ts`:

```ts
import { expect, test } from "@playwright/test";
import { buildPrototypeDocument } from "@meld/prototype";

const SCREEN_ID = "11111111-1111-4111-8111-111111111111";

test("an inert overlay tracks camera movement without drifting", async ({ page }) => {
  const document = buildPrototypeDocument({
    startScreenId: SCREEN_ID,
    tokenCss: "",
    screens: [
      {
        id: SCREEN_ID,
        name: "Overlay",
        markup: "<h1>Screen</h1><p>body copy</p>",
        styles: "h1 { font-size: 20px; }",
        script: null,
        actions: [],
      },
    ],
  });

  await page.setContent(`
    <!DOCTYPE html><html><head><style>
      body { margin: 0; height: 100vh; overflow: hidden; }
      #stage { position: relative; width: 100vw; height: 100vh; }
      #overlay {
        position: absolute; top: 0; left: 0; width: 390px; height: 844px;
        transform-origin: 0 0; border: 0;
      }
    </style></head><body>
      <main id="stage"><iframe id="overlay" sandbox=""></iframe></main>
      <script>
        document.getElementById("overlay").srcdoc = ${JSON.stringify(document)};
        window.__place = function (x, y, zoom) {
          document.getElementById("overlay").style.transform =
            "translate(" + x + "px," + y + "px) scale(" + zoom + ")";
        };
      </script>
    </body></html>
  `);

  // 120 camera updates: a pan-and-zoom gesture's worth.
  const measurement = await page.evaluate(async () => {
    const place = (window as never as { __place: (x: number, y: number, z: number) => void }).__place;
    const started = performance.now();
    for (let step = 0; step < 120; step += 1) {
      place(step * 2, step, 1 + step / 240);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const elapsed = performance.now() - started;
    const overlay = document.getElementById("overlay") as HTMLIFrameElement;
    const box = overlay.getBoundingClientRect();
    return { elapsed, left: box.left, top: box.top };
  });

  // The overlay must land exactly where the camera put it — no accumulated drift.
  expect(measurement.left).toBeCloseTo(238, 0);
  expect(measurement.top).toBeCloseTo(119, 0);

  // 120 frames at 60fps is 2000ms. Anything near that means we are frame-bound.
  expect(measurement.elapsed).toBeLessThan(4_000);
  console.log(`overlay: 120 camera updates in ${Math.round(measurement.elapsed)}ms`);
});
```

- [ ] **Step 3: Run it and record the number**

Run: `pnpm test:e2e:sandbox`
Expected: PASS, with the elapsed time logged.

Record the logged figure in Task 8. If it fails or the elapsed time is near the
frame budget, the finding is that slice 3 must render stored static images
instead of live overlays — the record representation from Task 5 is unaffected
either way.

- [ ] **Step 4: Commit**

```bash
git add e2e/prototype-overlay.spec.ts playwright.sandbox.config.ts
git commit -m "test(design): measure canvas overlay tracking under camera movement"
```

---

### Task 8: Findings report and spec amendments

A spike's deliverable is a decision, not code. This task writes down what was
proven, what was disproven, and what the spec now says differently.

**Files:**
- Create: `docs/design/reports/2026-08-13-design-room-slice-0-findings.md`
- Modify: `docs/superpowers/specs/2026-08-13-design-room-design.md`

- [ ] **Step 1: Run the whole slice's evidence in one pass**

```bash
pnpm --filter @meld/prototype test
pnpm --filter @meld/prototype typecheck
pnpm --filter @meld/gateway test sqlite-canvas-room
pnpm test:figma-oembed
pnpm test:e2e:sandbox
pnpm check:astryx
pnpm check:test-colocation
pnpm lint
```

Every command must pass before writing the report. `check:astryx` matters
specifically: it confirms no HTML-emitting module leaked into `apps/web/src`.

- [ ] **Step 2: Write the report**

Create `docs/design/reports/2026-08-13-design-room-slice-0-findings.md` with one
section per question, each stating the question, the evidence (command and
result), and the verdict — **proven**, **disproven**, or **open**:

1. Can a generated screen escape the sandbox? — cite `e2e/prototype-sandbox.spec.ts` and the capture-server result.
2. Does an inert frame refuse to run script? — cite the `sandbox=""` test.
3. Does routing survive inside the sandbox? — cite the routing test.
4. Can a screen ride the default tldraw schema as a `frame` with `meta`? — cite the gateway test, including whether the reopen preserved `meta`.
5. Does Figma oEmbed return a usable thumbnail without OAuth? — paste the live JSON verbatim, or the failure.
6. Does the overlay track the camera? — quote the logged milliseconds.
7. Do the byte budgets fit the task caps? — cite the headroom assertion.
8. Task scope — record as **decided, not tested**: `ai_tasks.room_id` is `not null` (migration `202607280001`, line 83) and `AITaskSchema.roomId` is required, so profile distillation is initiated from a room and its result promoted to workspace scope. No code proves this; it is a design constraint slice 1 implements. State it here so the spike's readers do not go looking for evidence that was never needed.

Where a verdict is **disproven** or **open**, state the consequence for the
later slices in one sentence.

- [ ] **Step 3: Amend the spec where reality disagreed**

Edit `docs/superpowers/specs/2026-08-13-design-room-design.md`:

- Change the status line from "A security/architecture spike (slice 0) precedes implementation" to a line recording that slice 0 completed, with a link to the findings report.
- Update any claim the spike disproved. The likely candidates are the Figma oEmbed paragraph, the overlay sentence in *Canvas integration contract*, and the `frame`-with-meta representation.
- If everything held, say so explicitly rather than leaving the spec silent.

- [ ] **Step 4: Commit**

```bash
git add docs/design/reports/2026-08-13-design-room-slice-0-findings.md \
        docs/superpowers/specs/2026-08-13-design-room-design.md
git commit -m "docs: record Design Room slice 0 spike findings"
```

---

## Definition of done

- `packages/prototype` exists with the screen contract, the safety scan, and the assembler, all under test.
- The escape matrix passes in a real browser, with a capture server proving zero requests escape.
- The gateway persists a `frame` shape carrying `meta.meldScreenId` across a reopen.
- The Figma oEmbed probe has been run live and its output recorded — pass or fail.
- The overlay measurement has been run and its number recorded.
- The findings report exists, and the spec has been amended to match reality.

Slice 1 (foundations: migrations, RLS, profile versions, screens and versions
with compare-and-swap promotion, the events table, and the two task kinds
threaded through executor, transport, SQL enum, hydration, and settlement) does
not start until every verdict in the findings report is **proven** or has an
explicit design amendment.
