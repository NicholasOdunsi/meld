# Component Skills + Design System Viewer — design

Date: 2026-08-19
Status: Approved (brainstorm), pending spec review
Scope: v1, proof-first. Dev-only behind the existing design/canvas trial flag.

## Problem

Generated screens already read well individually, but every screen **reinvents its
components from scratch**. Measured on two real generated screens (Home vs Address
Verification): they share **zero** component class names — ~113 bespoke classes, no
reuse, ~8 KB of re-derived CSS per screen. The cause is structural: the design
distiller turns an uploaded design system into **tokens + prose component rules**
(`design-profile.ts` `components: {name, rules}`; the distiller prompt says
*"Component rules are short prose … not code"*), so the screen generator re-implements
each component from a sentence every time. Consequence: cross-screen drift, a quality
ceiling (the model approximates instead of using the real component), and wasted tokens.

There is also no way to **see** the distilled design system — you only find out what it
looks like by generating full screens.

## Goals

- **G1 — Component skills.** For any uploaded design system (any source language — the
  distiller is an LLM reading a document), the distiller emits, for a **core set** of
  components, a real HTML/CSS implementation. Meld concatenates these into one **shared
  component stylesheet** injected into every generated screen. The screen generator
  **composes** screens from these components (`class="ds-datatable"`) instead of
  re-deriving them. Result: screens look like the real system and stay consistent.
- **G2 — Design System viewer.** A **workspace-level page** that renders the distilled
  design system as live pixels — tokens (colors, type, spacing, radii) and each generated
  component — so a non-designer can see "this is my design system" and judge fidelity.

## Non-goals

- **No behavior/interactivity.** The preview engine runs HTML/CSS with **no JavaScript**.
  Interactive components (popover, date picker, autocomplete, toast, map, sheet, wizard)
  render as static styled shells, not working widgets. v1 targets the *look*.
- **No React/Tailwind execution.** Uploaded React/Vue/Tailwind is *read* by the distiller
  and translated to plain HTML/CSS; none of it runs.
- **No full component coverage.** v1 is the ~7 high-frequency components below; the long
  tail keeps today's prose-rule fallback.
- **No editing in the viewer.** Read-only gallery. (Editing/authoring skills is a later
  idea.)
- **Not hardcoded to MaxOne.** MaxOne is the first proof; the mechanism is general.

## v1 core component set

`app-shell` (layout/nav frame), `button`, `input`, `form-field`, `card`, `table`,
`status-badge`, `page-header`. Everything else falls back to prose rules unchanged.

---

## G1 — Component skills

### Data model
- `packages/contracts/src/design-profile.ts`
  - Extend each `components[]` entry from `{name, rules}` to
    `{name, rules, html?, css?}`:
    - `html` — a usage template using `ds-`-namespaced classes, e.g.
      `<table class="ds-datatable"><thead>…</thead></table>`.
    - `css` — that component's styles, using the `--ds-*` token variables.
    - Both **optional** so existing profiles (prose-only) still parse, and non-core
      components stay `{name, rules}`.
    - New byte caps (`MAX_COMPONENT_HTML_BYTES`, `MAX_COMPONENT_CSS_BYTES`); the whole
      profile stays within `MAX_PROFILE_BYTES` (raise if needed for the core set).
  - `DesignProfileDistillResultSchema` gains `componentCss: string` — the sanitized,
    concatenated shared stylesheet Meld builds from the components' `css`.
- Storage (SQL migration): add `component_css text` to
  `design_system_profile_versions` (nullable; empty for legacy versions). Sits beside
  `token_css`.

### Distillation (source of skills)
- `apps/connector/src/tasks/design-profile-distill-prompt.ts`: extend the response
  schema + prompt so that, **for the core set only**, the model emits `html` + `css`
  per component (in addition to `rules`). Prompt guidance: use the extracted `--ds-*`
  tokens; `ds-` class namespace; self-contained static HTML/CSS; no JS; match the
  source's look. Keep token/prose extraction for everything else.
  - Consideration (plan decision): run core-component code generation as a **second,
    focused pass** (or a clearly separated schema section) so the larger HTML/CSS output
    does not crowd out or degrade token extraction. Same `design_profile_distill` task
    family; `task-executor.ts:248` config + `provider-adapter.ts` validation updated for
    the richer result.
- Meld (not the model) assembles `componentCss` from the per-component `css`: sanitize
  each (below), namespace-check `ds-*`, concatenate, enforce total byte cap. This mirrors
  the existing "Meld compiles token CSS, never the model" boundary — here the model
  authors component CSS (it must), so Meld's job is **sanitize + assemble**, not trust.

### Generation time (use of skills)
- `apps/connector/src/tasks/design-screen-generate-prompt.ts`:
  - `componentRulesSection` (today prose-only): for components that have `html`, include
    the **usage template + rules**; for the rest, prose as today.
  - `BASE_RULES`: add — *"Prefer these components: compose screens using their `ds-`
    classes and the markup templates shown; do NOT re-implement them or restyle their
    `ds-` classes. Write CSS only for page-specific layout. For anything not covered by a
    component, build cleanly with the tokens."* (Deliberately preserves the model's
    context-aware composition for the long tail — that is where the good bespoke content
    like domain-specific form fields comes from.)
- Render injection: the shared component stylesheet is injected into every rendered
  screen **alongside `tokenCss`**, in the same places `tokenCss` flows today:
  `apps/web/src/features/design/prototype-reader.ts` (`assembleRoomPrototype(tokenCss…)`),
  `design-profile-reader.ts` (return `componentCss` next to `tokenCss`), and the
  transcript preview (`components/agents-transcript.tsx`). Order: tokens → component
  stylesheet → per-screen styles, so page CSS can still override when needed.

### Safety
Model-authored component `html`/`css` are untrusted. Reuse the screen-output safety gates
(no `<script>`/JS, no inline handlers, no remote URLs, `data:` URIs only, byte caps) — the
same normalization the screen generator's markup/styles already pass through
(`packages/prototype/src/screen-normalize.ts` and the connector safety scan in
`provider-adapter.ts`). Enforce the `ds-` class namespace so component CSS can't collide
with page or Meld classes. Uploaded design content remains untrusted data, never
instructions.

### Back-compat
Existing workspace profiles have `token_css` + prose components and **keep working
unchanged** (`component_css` empty → nothing injected → today's behavior). A workspace
gets skills by **re-running distillation once** (the existing upload/distill trigger; add
a "re-distill / upgrade" affordance).

---

## G2 — Design System viewer (workspace page)

- **Route:** `apps/web/src/app/(app)/[workspaceId]/design-system/page.tsx` (new). The
  profile is already workspace-scoped (`design_system_profiles.workspace_id` →
  active `design_system_profile_versions`), so no new scoping is needed.
- **Reads:** the workspace's active profile version — `profile_json` (tokens +
  components, now with `html`), `token_css`, `component_css`.
- **Renders (read-only gallery):**
  - **Tokens:** color swatches (name + value), type scale, spacing scale, radii.
  - **Components:** for each component with `html`, render it **live** inside a sandboxed
    frame that has `token_css` + `component_css` applied — showing the real pixels — with
    its `name` and the class you'd use. Components with only prose show a "described, not
    yet generated" state.
  - **Empty state:** no profile yet → prompt to upload a design system (link to the flow
    that already exists in the composer).
- **Isolation:** render components in the same sandboxed way screens are previewed
  (no JS), so the viewer can never execute uploaded/model content.
- **Navigation:** a workspace-level entry point to the page (where workspace nav lives).

---

## Data flow (end to end)

Upload → distiller reads it → emits tokens + prose + (core set) `html`/`css` per
component → Meld sanitizes + assembles `token_css` and `component_css`, stores a new
`design_system_profile_versions` row → **(a)** screen generation: prompt shows component
templates, model composes with `ds-` classes, render injects `component_css` →
consistent screens; **(b)** viewer: workspace page reads the version and renders tokens +
components live.

## Success criteria (proof-first)

Regenerate a few real screens after a re-distill and confirm:
1. **Reuse:** cross-screen `ds-` class overlap jumps from ~0 to high (screens share the
   same components).
2. **Cost:** per-screen CSS bytes drop sharply (layout-only, not full component CSS).
3. **Fidelity (human):** a "these look like MaxOne and are consistent" pass — judged
   directly on the **viewer page** and on regenerated screens.
If all three hold → widen the component set in a follow-up. If fidelity is weak → the
distiller-emits-CSS bet needs iteration before expanding (this is exactly what
proof-first de-risks).

## Risks

- **Fidelity of AI-authored component CSS** — the core bet; proof-first + the viewer make
  it immediately visible. Mitigation: rich uploads yield better skills; iterate the
  distiller prompt.
- **Prompt budget** — showing component templates competes with the existing 24 KB
  component-rules budget; core set only, cap templates, disclose omissions.
- **Static shells for interactive components** — set expectations in the viewer (label
  non-interactive), keep interactive components out of the v1 core set where possible.
- **Profile byte cap** — component HTML/CSS is bigger than prose; may need to raise
  `MAX_PROFILE_BYTES` and store `component_css` as its own column (done) rather than
  inside `profile_json`.

## Testing

- **Unit:** design-profile schema (optional `html`/`css`, caps); distiller result parse
  (`componentCss`); `componentRulesSection` includes templates when present, prose
  otherwise; sanitizer strips JS/remote URLs from component html/css and enforces `ds-`
  namespace; render assembly injects `component_css` after `token_css`.
- **SQL:** migration adds `component_css`; profile read returns it; legacy versions
  (null) behave as empty.
- **E2E (canvas-trial / fakes):** with a fake profile that has component skills, a
  generated screen's rendered doc includes the component stylesheet and uses `ds-`
  classes; the **workspace Design System page** renders token swatches and at least one
  live component. Fake distiller emits `html`/`css` so this is observable without a model.

## Files touched (from exploration)

- `packages/contracts/src/design-profile.ts` — component `html`/`css`, result
  `componentCss`, byte caps.
- `apps/connector/src/tasks/design-profile-distill-prompt.ts` — emit core-set html/css.
- `apps/connector/src/tasks/task-executor.ts`, `providers/provider-adapter.ts` — richer
  distill result parse/validate.
- `packages/prototype/src/screen-normalize.ts` (+ safety scan) — reuse for component
  html/css sanitization + `ds-` namespace enforcement.
- Meld distill-apply path (web action storing the profile version) — assemble + store
  `component_css`.
- SQL migration — `design_system_profile_versions.component_css`.
- `apps/connector/src/tasks/design-screen-generate-prompt.ts` — templates + compose rule.
- `apps/web/src/features/design/prototype-reader.ts`, `design-profile-reader.ts`,
  `components/agents-transcript.tsx` — thread + inject `component_css` at render.
- `apps/web/src/app/(app)/[workspaceId]/design-system/page.tsx` (+ components) — viewer.
- `apps/web/src/features/rooms/e2e-fake.ts` — fake profile with skills; e2e specs.
- Colocated tests for each.

## Decisions / open (for the plan)

- Distiller: second focused pass vs one enriched schema — plan picks; lean **second pass**
  for output quality.
- Exact `ds-` class contract per core component (names + template shape) — plan defines a
  small fixed contract so the model, the stylesheet, and the viewer agree.
- Whether v1 injects `component_css` for the **shell/layout** too or only content
  components — lean include shell (biggest visible consistency win).
