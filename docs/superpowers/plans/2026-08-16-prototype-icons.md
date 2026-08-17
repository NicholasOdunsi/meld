# Prototype Icons via Lucide Substitution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give generated design-screen prototypes real icons by having the model name a Lucide icon (`<svg data-icon="NAME">`) and substituting the real inline SVG server-side at generation time.

**Architecture:** A pure substitution function in `@meld/prototype` (`substituteScreenIcons` / `substituteBatchIcons`) takes an injected `IconResolver`, so the package carries no icon dependency and the web bundle stays clean. The connector supplies a `lucide-static`-backed resolver and runs substitution inside the `design_screen_generate` branch of `taskConfigFor`, after schema parse and before the result is stored. Unknown names fall back to a neutral glyph. The web read/render path is unchanged.

**Tech Stack:** TypeScript, Zod, Vitest, `parse5` (already present), `lucide-static` (new, connector-only), pnpm workspaces, tsup (connector bundle).

## Global Constraints

- Substitution runs **server-side at generation time** (connector), never in the web read/render path.
- `@meld/prototype` MUST NOT depend on any icon library. The icon data is injected via an `IconResolver` callback. Only the connector imports `lucide-static`.
- Prototype markup is sandboxed inline HTML: **no remote URLs, no `<link>`, no icon fonts, no `<script>`.** Only inline `<svg>` is allowed. Do NOT add `xmlns="http://…"` to generated SVG (avoids any http string in markup; not needed for inline HTML SVG).
- Resolved icons use Lucide's canonical attributes with `stroke="currentColor"` so they inherit surrounding text color and theme via `--ds-*`.
- `MAX_SCREEN_MARKUP_BYTES` = 96 KiB. Substitution adds only a few hundred bytes per icon; no limit changes.
- Only newly generated prototypes get icons; existing prototypes are NOT rewritten.
- Use TDD: failing test first, minimal implementation, passing test, commit. Run the affected package's tests, not the whole monorepo, per step.

**Package test commands:**
- `@meld/prototype`: `pnpm --filter @meld/prototype test`
- `@meld/connector`: `pnpm --filter @meld/connector test`
- Connector typecheck: `pnpm --filter @meld/connector typecheck`
- Connector bundle smoke: `pnpm --filter @meld/connector test:bundle`

---

### Task 1: `substituteScreenIcons` — pure fragment substitution in `@meld/prototype`

**Files:**
- Create: `packages/prototype/src/screen-icons.ts`
- Create: `packages/prototype/src/screen-icons.test.ts`
- Modify: `packages/prototype/src/index.ts` (add `export * from "./screen-icons";`)

**Interfaces:**
- Consumes: `DesignScreenPayload`, `findScreenSafetyViolations` from `./screen-payload` / `./screen-safety` (existing; used only in the safety test).
- Produces:
  - `type IconResolver = (name: string) => string | null` — returns an icon's **inner** SVG markup (its `<path>`/`<circle>`… children) for a known kebab-case name, or `null` if unknown.
  - `substituteScreenIcons(markup: string, resolveIcon: IconResolver): string`

- [ ] **Step 1: Write the failing test**

Create `packages/prototype/src/screen-icons.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { substituteScreenIcons, type IconResolver } from "./screen-icons";
import { findScreenSafetyViolations } from "./screen-safety";

// A stub resolver so this package needs no icon library to test.
const stub: IconResolver = (name) =>
  name === "search" ? '<circle cx="11" cy="11" r="8"></circle>' : null;

describe("substituteScreenIcons", () => {
  it("replaces a known data-icon placeholder with real inline svg", () => {
    const out = substituteScreenIcons('<span><svg data-icon="search"></svg></span>', stub);
    expect(out).toContain('<circle cx="11" cy="11" r="8">');
    expect(out).toContain('stroke="currentColor"');
    expect(out).not.toContain("data-icon=");
  });

  it("falls back to a neutral glyph for an unknown name", () => {
    const out = substituteScreenIcons('<svg data-icon="not-a-real-icon"></svg>', stub);
    expect(out).toContain('stroke="currentColor"');
    expect(out).not.toContain("data-icon=");
    // fallback is a plain circle, not the resolver's search geometry
    expect(out).not.toContain('r="8"');
    expect(out).toContain("<circle");
  });

  it("preserves width, height, and class from the placeholder", () => {
    const out = substituteScreenIcons(
      '<svg data-icon="search" width="20" height="20" class="nav-ic"></svg>',
      stub,
    );
    expect(out).toContain('width="20"');
    expect(out).toContain('height="20"');
    expect(out).toContain('class="nav-ic"');
  });

  it("defaults to 24x24 when no size is given", () => {
    const out = substituteScreenIcons('<svg data-icon="search"></svg>', stub);
    expect(out).toContain('width="24"');
    expect(out).toContain('height="24"');
  });

  it("substitutes every placeholder and leaves other markup intact", () => {
    const out = substituteScreenIcons(
      '<a><svg data-icon="search"></svg></a><b><svg data-icon="search"/></b><i>hi</i>',
      stub,
    );
    expect(out.match(/<circle cx="11"/g)).toHaveLength(2);
    expect(out).toContain("<i>hi</i>");
  });

  it("leaves a real inline svg with children untouched", () => {
    const markup = '<svg viewBox="0 0 24 24"><path d="M0 0h24"/></svg>';
    expect(substituteScreenIcons(markup, stub)).toBe(markup);
  });

  it("produces markup that passes the safety gate", () => {
    const markup = substituteScreenIcons('<svg data-icon="search"></svg>', stub);
    const findings = findScreenSafetyViolations({
      markup,
      styles: "",
      script: null,
      actions: [],
    });
    expect(findings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @meld/prototype test screen-icons`
Expected: FAIL — `substituteScreenIcons` is not defined / module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `packages/prototype/src/screen-icons.ts`:

```ts
/**
 * Returns an icon's INNER svg markup (its <path>/<circle>… children) for a
 * known kebab-case Lucide name, or null when the name is unknown. Injected so
 * this module carries no icon-library dependency, which keeps the icon data
 * out of the web bundle — only the connector wires in the real resolver.
 */
export type IconResolver = (name: string) => string | null;

// Lucide's canonical presentation attributes. stroke="currentColor" is what
// makes an icon inherit the surrounding text color, so it themes for free via
// the design system's --ds-* variables. No xmlns: inline HTML svg needs none,
// and it keeps every http:// string out of prototype markup.
const SVG_ATTRS =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"';

// Shown when a name does not resolve, so an unknown icon leaves a deliberate
// mark at the requested size instead of a broken box (the "tofu" glyph).
const FALLBACK_INNER = '<circle cx="12" cy="12" r="9"></circle>';

// A placeholder is an EMPTY <svg> carrying data-icon: either <svg …></svg> or
// self-closing <svg …/>. Matching only the empty form means a real inline
// <svg> with children is never touched.
const ICON_PLACEHOLDER = /<svg\b([^>]*?)\s*(?:\/>|>\s*<\/svg>)/gi;

function readAttr(attrs: string, name: string): string | null {
  const match = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"|\\b${name}\\s*=\\s*'([^']*)'`, "i"),
  );
  return match ? (match[1] ?? match[2] ?? null) : null;
}

function buildSvg(inner: string, attrs: string): string {
  const width = readAttr(attrs, "width") ?? "24";
  const height = readAttr(attrs, "height") ?? "24";
  const className = readAttr(attrs, "class");
  const cls = className ? ` class="${className}"` : "";
  return `<svg width="${width}" height="${height}" ${SVG_ATTRS}${cls}>${inner}</svg>`;
}

/**
 * Replaces every `<svg data-icon="NAME">` placeholder in a markup fragment
 * with real inline SVG. Unknown names get a neutral fallback glyph. Non-icon
 * markup — including a real inline <svg> with children — is left byte-for-byte
 * unchanged.
 */
export function substituteScreenIcons(
  markup: string,
  resolveIcon: IconResolver,
): string {
  return markup.replace(ICON_PLACEHOLDER, (whole, attrs: string) => {
    const name = readAttr(attrs, "data-icon");
    if (name === null) return whole; // an empty <svg> that is not a placeholder
    const inner = resolveIcon(name) ?? FALLBACK_INNER;
    return buildSvg(inner, attrs);
  });
}
```

- [ ] **Step 4: Add the export**

In `packages/prototype/src/index.ts`, add after the `screen-normalize` export line:

```ts
export * from "./screen-icons";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @meld/prototype test screen-icons`
Expected: PASS (all 7 cases).

- [ ] **Step 6: Commit**

```bash
git add packages/prototype/src/screen-icons.ts packages/prototype/src/screen-icons.test.ts packages/prototype/src/index.ts
git commit -m "feat(prototype): substituteScreenIcons for inline-svg icon placeholders"
```

---

### Task 2: `substituteBatchIcons` — apply substitution across a batch

**Files:**
- Modify: `packages/prototype/src/screen-icons.ts`
- Modify: `packages/prototype/src/screen-icons.test.ts`

**Interfaces:**
- Consumes: `DesignScreenBatch` from `./screen-payload`; `substituteScreenIcons`, `IconResolver` from this module.
- Produces: `substituteBatchIcons(batch: DesignScreenBatch, resolveIcon: IconResolver): DesignScreenBatch` — returns a new batch with every `screen.markup` and every created layout's `shellMarkup` substituted.

- [ ] **Step 1: Write the failing test**

Append to `packages/prototype/src/screen-icons.test.ts`:

```ts
import { substituteBatchIcons } from "./screen-icons";
import type { DesignScreenBatch } from "./screen-payload";

describe("substituteBatchIcons", () => {
  const batch: DesignScreenBatch = {
    screens: [
      {
        markup: '<nav><svg data-icon="search"></svg></nav>',
        styles: "",
        script: null,
        actions: [],
      },
      {
        markup: "<main><svg data-icon=\"search\"></svg></main>",
        styles: "",
        script: null,
        actions: [],
        layout: {
          reuse: null,
          create: {
            layoutKey: "shell",
            name: "Shell",
            shellMarkup: '<header><svg data-icon="search"></svg><div data-meld-slot></div></header>',
            shellStyles: null,
            actions: [],
          },
        },
      },
    ],
  };

  it("substitutes screen markup and created-layout shellMarkup", () => {
    const out = substituteBatchIcons(batch, stub);
    expect(out.screens[0].markup).toContain('stroke="currentColor"');
    expect(out.screens[1].markup).toContain('stroke="currentColor"');
    const shell = out.screens[1].layout?.create?.shellMarkup ?? "";
    expect(shell).toContain('stroke="currentColor"');
    // the slot invariant is preserved
    expect(shell).toContain("data-meld-slot");
    // no placeholders remain anywhere
    expect(JSON.stringify(out)).not.toContain("data-icon=");
  });

  it("leaves a reuse-only layout screen's layout intact", () => {
    const reuseBatch: DesignScreenBatch = {
      screens: [
        {
          markup: '<svg data-icon="search"></svg>',
          styles: "",
          script: null,
          actions: [],
          layout: { reuse: { layoutKey: "shell" }, create: null },
        },
      ],
    };
    const out = substituteBatchIcons(reuseBatch, stub);
    expect(out.screens[0].layout?.reuse?.layoutKey).toBe("shell");
    expect(out.screens[0].markup).toContain('stroke="currentColor"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @meld/prototype test screen-icons`
Expected: FAIL — `substituteBatchIcons` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Add to `packages/prototype/src/screen-icons.ts` (import the type at top, add the function at the bottom):

```ts
import type { DesignScreenBatch } from "./screen-payload";
```

```ts
/**
 * Runs substituteScreenIcons over every screen's markup and every created
 * layout's shellMarkup in a batch, returning a new batch. reuse-only and
 * layout-less screens keep their layout unchanged.
 */
export function substituteBatchIcons(
  batch: DesignScreenBatch,
  resolveIcon: IconResolver,
): DesignScreenBatch {
  return {
    ...batch,
    screens: batch.screens.map((screen) => {
      const markup = substituteScreenIcons(screen.markup, resolveIcon);
      const create = screen.layout?.create;
      if (!create) return { ...screen, markup };
      return {
        ...screen,
        markup,
        layout: {
          ...screen.layout!,
          create: {
            ...create,
            shellMarkup: substituteScreenIcons(create.shellMarkup, resolveIcon),
          },
        },
      };
    }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @meld/prototype test screen-icons`
Expected: PASS (all cases, old and new).

- [ ] **Step 5: Commit**

```bash
git add packages/prototype/src/screen-icons.ts packages/prototype/src/screen-icons.test.ts
git commit -m "feat(prototype): substituteBatchIcons across screens and layouts"
```

---

### Task 3: `lucideIconResolver` — Lucide-backed resolver in the connector

**Files:**
- Modify: `apps/connector/package.json` (add `lucide-static` dependency)
- Create: `apps/connector/src/tasks/lucide-icon-resolver.ts`
- Create: `apps/connector/src/tasks/lucide-icon-resolver.test.ts`

**Interfaces:**
- Consumes: `IconResolver` from `@meld/prototype`; Lucide's `icon-nodes.json`.
- Produces: `lucideIconResolver: IconResolver` — resolves a kebab-case Lucide name to inner SVG markup, or `null`.

- [ ] **Step 1: Add the dependency and inspect the data shape**

```bash
pnpm --filter @meld/connector add lucide-static
node -e "const n=require('lucide-static/icon-nodes.json'); console.log(JSON.stringify(n.search)); console.log('search' in n, 'not-a-real-icon' in n);"
```

Expected: `n.search` prints an array of `[tag, attrsObject]` tuples (e.g. `[["circle",{"cx":"11","cy":"11","r":"8"}],["path",{"d":"m21 21-4.34-4.34"}]]`), `true false`. If the array-of-tuples shape differs from this, adjust `LucideNode` and `nodeToMarkup` in Step 3 to match the actual shape before proceeding.

- [ ] **Step 2: Write the failing test**

Create `apps/connector/src/tasks/lucide-icon-resolver.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { lucideIconResolver } from "./lucide-icon-resolver";

describe("lucideIconResolver", () => {
  it("returns inner svg markup for a known lucide name", () => {
    const inner = lucideIconResolver("search");
    expect(inner).not.toBeNull();
    // search is a circle + a path in lucide
    expect(inner).toContain("<circle");
    expect(inner).toContain("<path");
    // inner children only — no wrapping <svg>
    expect(inner).not.toContain("<svg");
  });

  it("returns null for an unknown name", () => {
    expect(lucideIconResolver("not-a-real-icon")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @meld/connector test lucide-icon-resolver`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the minimal implementation**

Create `apps/connector/src/tasks/lucide-icon-resolver.ts`:

```ts
import type { IconResolver } from "@meld/prototype";
import iconNodes from "lucide-static/icon-nodes.json";

// Lucide ships each icon as an array of [tagName, attributes] child nodes.
type LucideNode = [string, Record<string, string | number>];

function nodeToMarkup([tag, attrs]: LucideNode): string {
  const serialized = Object.entries(attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
  return `<${tag}${serialized ? ` ${serialized}` : ""}/>`;
}

const table = iconNodes as unknown as Record<string, LucideNode[]>;

/** Resolves a kebab-case Lucide icon name to its inner SVG markup, or null. */
export const lucideIconResolver: IconResolver = (name) => {
  const nodes = table[name];
  return nodes ? nodes.map(nodeToMarkup).join("") : null;
};
```

- [ ] **Step 5: Run test, typecheck, and bundle smoke**

Run: `pnpm --filter @meld/connector test lucide-icon-resolver`
Expected: PASS.

Run: `pnpm --filter @meld/connector typecheck`
Expected: PASS. If TS cannot resolve the JSON import, confirm `resolveJsonModule` is enabled in the connector's tsconfig (add it if missing); if the inferred JSON type is rejected, the `as unknown as` cast already sidesteps it.

Run: `pnpm --filter @meld/connector test:bundle`
Expected: PASS — tsup/esbuild inlines the JSON import into the bundle. If the JSON is not bundled, switch the import to `createRequire(import.meta.url)("lucide-static/icon-nodes.json")` and re-run.

- [ ] **Step 6: Commit**

```bash
git add apps/connector/package.json apps/connector/src/tasks/lucide-icon-resolver.ts apps/connector/src/tasks/lucide-icon-resolver.test.ts
# pnpm-lock.yaml also changed from the add:
git add pnpm-lock.yaml
git commit -m "feat(connector): lucide-static-backed icon resolver"
```

---

### Task 4: Wire substitution into generation and update the prompt

**Files:**
- Modify: `apps/connector/src/tasks/task-executor.ts` (imports + `design_screen_generate` branch of `taskConfigFor`, ~line 298)
- Modify: `apps/connector/src/tasks/design-screen-generate-prompt.ts` (version bump + one rule line)
- Create or Modify: `apps/connector/src/tasks/design-screen-generate-prompt.test.ts`
- Create: `apps/connector/src/tasks/design-screen-icons.test.ts` (end-to-end substitution over a batch using the real resolver)

**Interfaces:**
- Consumes: `substituteBatchIcons` (`@meld/prototype`), `lucideIconResolver` (`./lucide-icon-resolver`), `DesignScreenBatchSchema` (already imported in task-executor.ts).
- Produces: the `design_screen_generate` task's `parseResult` now returns an icon-substituted `DesignScreenBatch`.

- [ ] **Step 1: Write the failing prompt test**

Check whether `apps/connector/src/tasks/design-screen-generate-prompt.test.ts` exists. If it does, add these cases; if not, create it:

```ts
import { describe, expect, it } from "vitest";
import {
  DESIGN_SCREEN_GENERATE_PROMPT_VERSION,
  DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT,
} from "./design-screen-generate-prompt";

describe("design screen generate prompt — icons", () => {
  it("is bumped to v4", () => {
    expect(DESIGN_SCREEN_GENERATE_PROMPT_VERSION).toBe("design-screen-generate-v4");
  });

  it("instructs the model to emit data-icon svg placeholders", () => {
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toContain('data-icon="NAME"');
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toContain("Lucide");
  });
});
```

- [ ] **Step 2: Write the failing end-to-end substitution test**

Create `apps/connector/src/tasks/design-screen-icons.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { substituteBatchIcons, type DesignScreenBatch } from "@meld/prototype";
import { lucideIconResolver } from "./lucide-icon-resolver";

describe("design screen icon substitution (connector wiring)", () => {
  it("resolves data-icon placeholders to real lucide svg", () => {
    const batch: DesignScreenBatch = {
      screens: [
        {
          markup: '<nav><svg data-icon="search"></svg><svg data-icon="bell"></svg></nav>',
          styles: "",
          script: null,
          actions: [],
        },
      ],
    };
    const out = substituteBatchIcons(batch, lucideIconResolver);
    expect(out.screens[0].markup).not.toContain("data-icon=");
    expect(out.screens[0].markup).toContain('stroke="currentColor"');
    // real lucide geometry, not the fallback circle at r="9"
    expect(out.screens[0].markup).not.toContain('r="9"');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @meld/connector test design-screen-generate-prompt design-screen-icons`
Expected: FAIL — version is still `v3`, prompt lacks `data-icon`.

- [ ] **Step 4: Update the prompt**

In `apps/connector/src/tasks/design-screen-generate-prompt.ts`:

Change the version constant (line 9-10):

```ts
export const DESIGN_SCREEN_GENERATE_PROMPT_VERSION =
  "design-screen-generate-v4";
```

Add this bullet to `BASE_RULES` immediately after the markup rule (the line ending `Images and fonts must use data: URIs.`):

```
- For icons, emit <svg data-icon="NAME"></svg> where NAME is a kebab-case Lucide icon name (e.g. search, menu, chevron-down, bell, user, settings, plus, check, x, arrow-right). Set width/height to size it; the icon inherits the current text color. Do not hand-draw icon paths, and do not use icon fonts or external icon URLs.
```

- [ ] **Step 5: Wire substitution into `taskConfigFor`**

In `apps/connector/src/tasks/task-executor.ts`:

Add to the existing `@meld/prototype` import the `substituteBatchIcons` symbol, and add a new import for the resolver near the other task-prompt imports:

```ts
import { substituteBatchIcons } from "@meld/prototype";
import { lucideIconResolver } from "./lucide-icon-resolver";
```

(If `@meld/prototype` is already imported as a named-import block, add `substituteBatchIcons` to that block instead of a second import statement.)

Replace the `design_screen_generate` branch of `taskConfigFor` (currently ~lines 298-303):

```ts
  if (context.kind === "design_screen_generate") {
    return {
      ...TASK_CONFIG.design_screen_generate,
      systemPrompt: buildDesignScreenSystemPrompt(context),
      parseResult: (result: unknown) =>
        substituteBatchIcons(
          DesignScreenBatchSchema.parse(result),
          lucideIconResolver,
        ),
    };
  }
```

- [ ] **Step 6: Run the affected tests, typecheck, and bundle smoke**

Run: `pnpm --filter @meld/connector test design-screen-generate-prompt design-screen-icons`
Expected: PASS.

Run: `pnpm --filter @meld/connector test`
Expected: PASS — confirm no other test asserted the old `v3` version string or the exact `BASE_RULES` text; update any that did to the new value.

Run: `pnpm --filter @meld/connector typecheck && pnpm --filter @meld/connector test:bundle`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/connector/src/tasks/task-executor.ts apps/connector/src/tasks/design-screen-generate-prompt.ts apps/connector/src/tasks/design-screen-generate-prompt.test.ts apps/connector/src/tasks/design-screen-icons.test.ts
git commit -m "feat(connector): substitute lucide icons into generated screens; prompt v4"
```

---

## Final verification

- [ ] `pnpm --filter @meld/prototype test` — all green.
- [ ] `pnpm --filter @meld/connector test` — all green.
- [ ] `pnpm --filter @meld/connector typecheck && pnpm --filter @meld/connector test:bundle` — green.
- [ ] Grep sanity: `grep -rn "lucide" apps/web/src` returns nothing (no web-bundle leak); `grep -rn "lucide-static" packages/prototype` returns nothing (package stays icon-library-free).
```
