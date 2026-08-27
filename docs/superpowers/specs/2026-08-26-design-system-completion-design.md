# Finishing the design system: building every component, and holding screens to it

## In plain language

A design system is distilled from your uploaded reference into two halves: **tokens**
(colours, type, spacing, radii) and **components** (a card, a button, a review block).
Today the tokens arrive whole and the components arrive half-built.

The distiller is hardcoded to write real HTML and CSS for eight generic components --
app-shell, button, input, form-field, card, table, status-badge, page-header -- and for
everything else it writes only a sentence of prose describing the look. On the live
workspace profile that is **8 built out of 24**. The sixteen left as prose are the ones
that carry the product's character: `experience-card`, `host-card`, `reservation-card`,
`reviews-card`, `rating-display-card`, `amenity-row`, `date-picker-day`, `search-bar-pill`,
`search-orb`, `button-pill-rausch`, `button-tertiary-text`, `icon-button-circle`,
`product-tab`, `new-tag`, `footer-light`, `legal-band`.

That one gap causes three separate problems:

1. **The Design System page looks unfinished.** A component with no HTML renders as a bare
   name card. This is a *data* gap, not a UI gap -- the page already builds a live preview
   for any component that has HTML, through the same sandboxed pipeline a prototype uses.
   Filling the data lights up the page with no interface work at all.
2. **Screens drift.** For those sixteen, every generation re-invents the look from prose,
   so the same card comes out slightly different on each screen.
3. **Generation is slower.** The model rewrites that styling on every screen it builds.

And there is a fourth problem underneath all of them. Screen styles are injected into the
prototype document *after* the design system's styles, so a screen that writes its own
`.ds-card` rule silently wins. The generator is already told in words not to do this
(`design-screen-generate-prompt.ts` BASE_RULES: "do NOT re-implement or restyle any ds-
class") but nothing checks, and the cascade rewards ignoring it.

This design does two things: **build the missing components once**, and **stop screens
overriding them**.

## Part 1 -- Build the missing components

### Shape

A new task kind, `design_component_build`. Each task builds **up to four** components. The
components still missing HTML are grouped into batches of four and the batches run
**one after another**, the next queued when the previous settles.

Batching rather than one-task-per-component is deliberate. Sixteen simultaneous provider
processes is heavy on the machine and can exhaust a subscription in one burst -- this
workspace has already recorded a `usage_limit_reached` mid-chain. Four batches of four is
four provider runs, sequential, bounded.

Each task runs on the provider's **fast pinned model** (`gpt-5.4`, `claude-haiku-4-5`)
rather than the reasoning model used for whole screens. `ai_tasks.model` is already
nullable and per-task, and adapters validate the value against the release manifest, so
this needs no new mechanism. A component is small and self-contained; the reasoning tier
buys nothing here.

### What each task is given

- The component's `name` and its prose `rules` from the profile.
- The profile's `tokenCss`, so it builds against real variables.
- **Two or three already-built components** (name, html, css) as style references, chosen
  from the eight core ones, so a new component matches the system's established feel
  rather than reinterpreting it. This mirrors the REFERENCE SCREEN mechanism that keeps
  generated screens looking like siblings.

### What it returns

Per component, the shape the distiller already emits: `name`, `html` (a usage template
using `ds-` namespaced classes), `css` (that component's styles, referencing `--ds-*`
variables). Static only -- the same prohibitions the distiller states: no JavaScript, no
`<script>`, no inline handlers, no remote URLs, no `@import`.

### Where results land

`design_system_profiles.active_version_id` is an explicit pointer, not "latest wins", which
makes the switch clean:

1. At pass start, copy the active version into a new `design_system_profile_versions` row --
   the **target version**. The active pointer is not moved.
2. Each settled batch merges its components into the target version's `profile_json` and
   recompiles `component_css` (`compileComponentCss`, capped at
   `MAX_COMPONENT_CSS_TOTAL_BYTES` = 48 KB).
3. When the final batch settles, the active pointer moves to the target version -- one
   atomic switch.

The current design system therefore stays live and unchanged for the whole pass. If the
pass stops halfway, the active pointer never moved and the partial target row is simply
unused.

Merging follows the existing materialization pattern: a trigger on `ai_tasks` reaching a
terminal state, like `materialize_design_profile_distill()`.

### Failure handling

- **A component whose HTML fails the screen-safety gate**: retried once. It is appended to
  a following batch, or -- if none remains -- to one final retry batch. If it fails again it
  stays prose-only in the target version and the page shows it as not built. The page never
  claims a component exists when it does not.
- **A batch that fails entirely** (provider unavailable, usage limit): the pass stops and
  the active pointer stays where it is. The person is told which of the two it was.
- **Resuming**: re-running the pass builds only components still missing HTML, so a resume
  costs nothing for work already done. This makes the pass idempotent.

### Triggering

- **Automatically** after a distillation completes, for every prose-only component.
- **Manually** from the Design System page ("Build components"), which resumes a stopped
  pass or rebuilds anything missing. Every AI task requires a `room_id`, and the page is
  workspace-scoped, so the action resolves the room from the `design_profile_distills` row
  that produced the active version.

## Part 2 -- Holding screens to the design system

### Where it runs

At **assembly**, in `packages/prototype`, where the prototype document is built. Both the
web app and the Design System page's own component previews go through this path.

This is the same call made for broken images in the fidelity fixes, and for the same
reasons: it repairs screens that are **already** stored wrong without regenerating them, it
needs no connector rebuild and reinstall to take effect, and it cannot be bypassed by a
screen that was generated before the rule existed. The generator's prompt keeps its
existing rule so new screens comply at the source; assembly is the backstop, not the only
line of defence.

### The rules

Both are deterministic. No second model call, no judgement.

**R1 -- component overrides.** For any rule in a screen's styles whose selector references
a `.ds-*` class, drop the **visual** declarations and keep the rest:

- Dropped: `background`, `background-color`, `border`, `border-radius`, `box-shadow`,
  `color`, `font-size`, `font-weight`, `padding`.
- Kept: everything else -- `margin`, `width`, `grid-area`, `flex`, and the like.

A screen may legitimately *place* your card; it may not *restyle* it. That line is not
invented for this feature: `component-vocabulary.ts` already separates exactly this set of
visual properties from layout plumbing, with the reasoning written out. This reuses it.
A rule left with no declarations is dropped entirely.

**R2 -- hardcoded colours.** A colour literal in a screen's styles that exactly matches a
token's value is rewritten to `var(--ds-<token>)`. Behaviour-preserving, and it makes the
screen respond to a future token change.

Normalisation covers hex (`#abc`, `#aabbcc`, `#aabbccff`) and `rgb()`/`rgba()`, compared
case-insensitively, so `#FF5A5F`, `#ff5a5f` and `rgb(255, 90, 95)` are one colour. Other
notations -- `hsl()`, named colours like `red`, `color-mix()` -- are compared literally and
in practice will not match; they are treated as "matches nothing" rather than converted,
because a conversion this pass got subtly wrong would change a design silently.

A colour that matches nothing is **reported, never rewritten**. Guessing which token an
off-brand colour "meant" would do exactly that damage.

### Parsing

Reuses the CSS rule scanner already in `component-vocabulary.ts` (`CSS_RULE`, and its
single-class selector handling), extended to compound selectors so `.page .ds-card` is
caught as well as `.ds-card`. Anything that does not parse is left untouched -- the
enforcement pass must never be able to corrupt a screen it did not understand.

### What the person sees

One line in the prototype viewer's existing notice area, only when the count is non-zero:
*"3 design-system overrides corrected."* Nothing at all for a clean screen.

That count is **corrections only** -- R1 strips and R2 rewrites. Colours that matched no
token (R3's report) are returned in the findings but not surfaced in this iteration. They
are the ambiguous case: an off-brand colour may be a deliberate one-off accent, so a count
of them would carry the same lie the rejected "unconnected buttons" badge would have. They
are recorded so a later pass can decide what, if anything, to say about them.

Deliberately not a badge counting anything ambiguous. The fidelity plan's reasoning stands:
across the current room 56 actions have no target and only 3 are genuinely dead, so a count
of "unconnected buttons" would read 56 when the truth is 3. A `.ds-` override does not have
that problem -- it is an exact, unambiguous violation of a rule the generator was given, so
a count of it is honest.

## Verification

**Unit (`packages/prototype`)**
- An override of `.ds-card`'s background is stripped; its margin survives.
- A compound selector `.page .ds-card` is caught.
- A rule reduced to nothing is removed entirely.
- `#FF5A5F` maps to `var(--ds-color-rausch)` when that token holds that value; the
  equivalent `rgb()` form maps too.
- A colour matching no token is reported and left in place.
- Malformed CSS passes through unchanged.
- A screen with no design system is untouched (no tokens, nothing to enforce).

**Unit (connector)**
- The build prompt includes the component's rules, the token CSS and the reference
  components.
- A returned component failing the safety gate is dropped from the batch, and the rest of
  the batch survives (the salvage behaviour screens already have).

**Database (pgTAP)**
- A settled batch merges into the target version and leaves the active pointer alone.
- The final batch moves the active pointer.
- A failed batch leaves the active pointer untouched.
- Re-running builds only components still missing HTML.

**End to end, against the real profile**
- Run the pass on the live 24-component profile; all 24 preview on the Design System page.
- Generate one screen afterwards and confirm zero overrides reported.

## Out of scope

- Rebuilding the eight components that already have HTML.
- State variants (hover, focus, disabled) in the viewer.
- Image-based distillation (the distiller reads extracted text only today).
- Parallel chain generation and model tiering for screen edits -- the separate speed work.

## Files this touches

- `apps/connector/src/tasks/design-component-build-prompt.ts` (new), registered in
  `task-executor.ts` alongside the other task kinds.
- `packages/prototype/src/design-system-conformance.ts` (new), called from
  `assemble-prototype.ts`.
- `supabase/migrations/` -- new `design_component_build` enum value, batch queueing and the
  merge/activate trigger, mirroring `materialize_design_profile_distill()`.
- `apps/web/src/features/design/` -- the "Build components" action and the override notice.
