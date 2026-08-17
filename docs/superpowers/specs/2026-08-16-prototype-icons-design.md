# Prototype Icons via Lucide Substitution — Design

Date: 2026-08-16
Status: Approved (brainstorm), pending implementation plan

## Problem

Generated design-screen prototypes render without icons. Where an icon
belongs (e.g. a nav item), the screen shows nothing or the browser's
"tofu" placeholder box (see the reported Dashboard screenshot). Root
cause: the generation system prompt
(`apps/connector/src/tasks/design-screen-generate-prompt.ts`) never
mentions icons/SVG and forbids every remote mechanism (no `<link>`, no
remote URLs, no `<script>`), while no icon dependency exists in any
package. The sandbox (iframe `srcDoc` + strict CSP `img-src data:` /
`font-src data:` / `connect-src 'none'` + the `screen-safety` allowlist)
can only ever render **inline `<svg>`** or `data:` URIs — so the model
has neither a library nor instructions to produce icons, and they get
dropped.

## Chosen approach

**Model names the icon; the pipeline substitutes the real SVG,
server-side, at generation time.**

- The model emits a lightweight placeholder: `<svg data-icon="NAME"></svg>`,
  where `NAME` is a kebab-case Lucide icon name it already knows from
  training (no injected list — near-zero prompt cost).
- A deterministic substitution step in the **connector** (Node, at
  generation time) replaces each placeholder with Lucide's real inline
  SVG before the screen is stored.
- Unknown/hallucinated names fall back to a neutral generic glyph so
  layout never breaks.

### Why these decisions

- **Server-side, generation-time** (not web read-time): the full Lucide
  set (~1,500 icons) stays a Node-only dependency and never ships to the
  browser bundle — zero client bloat. The stored markup already contains
  the resolved SVG, so the web read/render path is unchanged.
  - Accepted trade-off: only newly generated prototypes get icons;
    existing prototypes are not rewritten retroactively.
- **Model free-names icons (no injected allowlist)**: full icon
  coverage at near-zero prompt cost; occasional invalid names are
  handled by the fallback glyph.
- **Inline SVG**: the only mechanism the sandbox + CSP + `screen-safety`
  allowlist permit. Lucide markup is pure `<path>/<circle>/<line>` with
  no SMIL and no remote URLs, so substituted output passes
  `findScreenSafetyViolations` unchanged.

## Components

### 1. `substituteScreenIcons` — pure function in `@meld/prototype`

New module `packages/prototype/src/screen-icons.ts`, exported from
`index.ts`, colocated with `screen-safety` / `screen-normalize`.

```
substituteScreenIcons(markup: string, resolveIcon: IconResolver): string
```

- `IconResolver = (name: string) => string | null` — returns the icon's
  **inner** SVG markup (the `<path>`/`<circle>`… children) for a known
  name, or `null` for unknown.
- The function finds each `<svg data-icon="NAME">…</svg>` placeholder and
  replaces it with a full `<svg>`:
  - `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`,
    `stroke-width="2"`, `stroke-linecap="round"`,
    `stroke-linejoin="round"` (Lucide's canonical attributes) so icons
    inherit surrounding text `color` and work in any `--ds-*` theme.
  - **Preserves** `width`, `height`, and `class` from the placeholder if
    present; defaults to `width="24" height="24"` otherwise.
  - Inserts `resolveIcon(name)` as the children.
- On `resolveIcon(name) === null` (unknown name), emits a **neutral
  fallback glyph** (a simple outlined circle) at the requested size,
  built from the same wrapper. The fallback is defined inside this pure
  module so it is testable without any Lucide dependency.
- Injecting the resolver keeps `@meld/prototype` free of any Lucide
  dependency, so the web bundle (which imports `@meld/prototype`) never
  pulls in icon data.

A batch helper applies it to every screen's `markup` and every created
layout's `shellMarkup` in a `DesignScreenBatch`:

```
substituteBatchIcons(batch: DesignScreenBatch, resolveIcon: IconResolver): DesignScreenBatch
```

Implementation note: prefer a targeted replace over full parse5
re-serialization so non-icon markup stays byte-identical. `@meld/prototype`
already depends on `parse5`; the subagent chooses parse5-scoped matching
vs. a scoped regex during TDD, whichever yields correct, well-tested
attribute preservation. `styles` are never touched (no icons there).

### 2. `lucideIconResolver` — Node-only resolver in the connector

New module `apps/connector/src/tasks/lucide-icon-resolver.ts`.

- Adds `lucide-static` to `apps/connector` dependencies.
- Loads Lucide's `icon-nodes.json` (name → array of `[tag, attrs]`
  child nodes) once and builds an `IconResolver` that serializes the
  child nodes to inner SVG markup for a given kebab-case name.
- The exact `lucide-static` export shape is verified against the
  installed package during implementation (icon-nodes vs. per-file SVG);
  the resolver adapts to whichever the package provides, but stays a
  pure `name → inner-svg-or-null` function.

### 3. Connector wiring — `taskConfigFor`

In `apps/connector/src/tasks/task-executor.ts`, the existing
`design_screen_generate` branch (currently overriding `systemPrompt`,
~line 298) also wraps `parseResult` to run substitution:

```
if (context.kind === "design_screen_generate") {
  return {
    ...TASK_CONFIG.design_screen_generate,
    systemPrompt: buildDesignScreenSystemPrompt(context),
    parseResult: (result) =>
      substituteBatchIcons(DesignScreenBatchSchema.parse(result), lucideIconResolver),
  };
}
```

Substitution runs after schema parse and before the result envelope, so
the placeholder never reaches storage and the stored markup is final,
safe, resolved SVG. `MAX_SCREEN_MARKUP_BYTES` is 96KB — inline icons add
only a few hundred bytes each, so headroom is ample.

### 4. Prompt change — `design-screen-generate-prompt.ts`

Bump `DESIGN_SCREEN_GENERATE_PROMPT_VERSION` `v3 → v4`. Add to
`BASE_RULES` (near the markup rule at line 26):

> For icons, emit `<svg data-icon="NAME"></svg>` where NAME is a
> kebab-case Lucide icon name (e.g. search, menu, chevron-down, bell,
> user, settings, plus, check, x, arrow-right). Set width/height to size
> it; the icon inherits the current text color. Do not hand-draw icon
> paths, and do not use icon fonts or external icon URLs.

A handful of example names anchor the format without injecting a full
list (keeps prompt cost minimal).

## Data flow

```
model → { screens:[{ markup: "...<svg data-icon='search'></svg>..." }] }
  → DesignScreenBatchSchema.parse           (connector, existing)
  → substituteBatchIcons(batch, lucideIconResolver)   (NEW, connector)
      → per screen.markup + layout.create.shellMarkup:
          substituteScreenIcons(markup, resolveIcon)  (NEW, @meld/prototype)
              known name  → full <svg stroke="currentColor">…lucide…</svg>
              unknown     → neutral fallback glyph
  → result envelope → stored
  → web read/render path UNCHANGED (screen-safety passes; iframe renders)
```

## Error handling

- Unknown/misspelled icon name → neutral fallback glyph at requested
  size (never a tofu box, never a broken layout).
- Placeholder with unexpected/no size attributes → default 24×24.
- Resolver load failure would be a connector startup/programming error,
  surfaced normally; not a per-screen concern.

## Testing (TDD)

`@meld/prototype` unit tests (`screen-icons.test.ts`), no Lucide dep
(inject a stub resolver):
- known name → wrapper with `stroke="currentColor"` and resolver's inner
  markup.
- unknown name → fallback glyph.
- `width`/`height`/`class` on the placeholder are preserved; absent →
  24×24 default.
- multiple placeholders in one markup all substituted.
- non-icon markup is otherwise unchanged.
- `substituteBatchIcons` covers both `screen.markup` and created
  `layout.shellMarkup`.

Safety integration:
- a substituted screen passes `findScreenSafetyViolations` (no findings).

Connector:
- `lucideIconResolver` returns non-null inner SVG for a real Lucide name
  (e.g. `search`) and `null` for a nonexistent name — verified against
  the installed `lucide-static`.
- `taskConfigFor` for `design_screen_generate` yields a batch whose
  markup contains resolved `<svg>` (no `data-icon` placeholders remain).

## Out of scope

- Retroactively adding icons to already-generated prototypes.
- Any web-bundle / read-time icon rendering.
- A curated/constrained icon allowlist in the prompt.
- Icon color/stroke controls beyond `currentColor` inheritance.
```
