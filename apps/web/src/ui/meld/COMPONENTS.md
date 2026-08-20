# Meld design system — component registry

The living index of the Meld design system. **Update this file in the same
change that adds or alters a component** — it is the first thing to read before
building a new screen, and a stale entry is worse than a missing one.

Import from `@/ui/meld/<file>`.

---

## The rules

These are enforced by `scripts/check-astryx-conventions.mjs`, not just
convention.

1. **Tokens only.** `tokens.css` is the only file in the app permitted to
   contain a literal hex colour or `px` value. Everything else — including
   every other file in this directory — reaches them through `var(--meld-*)`.
2. **Primitives own their markup.** Files under `apps/web/src/ui/meld/` may use
   raw `<div>`, `<span>`, `<button>`, `<input>`. **Feature code may not** — it
   composes primitives instead. This is the one directory the raw-element ban
   is lifted for.
3. **Flat.** No offset shadows, no blur, nothing protrudes off the page. Depth
   is communicated by colour and the notch, never by elevation.
4. **Namespaced.** All tokens are `--meld-*`. Astryx still owns `--color-*`,
   `--spacing-*` and friends until the migration completes; colliding with
   those would silently restyle 100+ unmigrated files.
5. **Stable selector surface.** Components reflect their variant and size as
   `data-*` attributes. Hashed CSS-module class names cannot be targeted from a
   test or a parent, so `data-variant` / `data-size` are part of the contract.

## The look

Light mode only. White work surfaces, colour concentrated into blocks so it
reads as deliberate. Archivo everywhere legible, at `-0.05em` tracking on
display type only. Pixelify Sans (`var(--meld-font-pixel)`) is reserved for
small metadata, labels, and status text — **never body copy, never titles**.

**Sky Blue is the accent** — the brand guide's "Data". Reach it through the
role tokens (`--meld-accent`, `--meld-accent-hover`, `--meld-text-on-accent`),
not the pigment, so retuning it stays a one-line change.

**The pixel corner** is the signature: a three-step staircase at each corner,
cut with `clip-path: var(--meld-pixel-corner)`. Steps are deliberately small
(`--meld-pixel-step`, 2px) — one large chamfer reads as a bevel, a fine
staircase reads as pixel art.

Two consequences that will bite if you forget them:

- **`clip-path` clips `outline` away entirely.** Focus rings must be
  `inset box-shadow`, which follows the stepped edge for free.
- **A border or inset shadow does not follow the staircase.** Both draw a
  rectangular ring that the clip then slices, so the edge stops dead at each
  step. To give a clipped element a visible edge, paint a **frame layer**: a
  filled, clipped parent with `padding: var(--meld-pixel-step)`, holding a
  second clipped element. `MeldTextInput` does exactly this.

---

## Components

### `MeldDeckFrame` — `deck-frame.tsx`

The workspace deck's plane: a dot field on the 24px grid with a single hairline
frame inset from the edge. A container only — regions position themselves
against the grid rather than flowing.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | The deck's regions. |

### `MeldWatermark` — `watermark.tsx`

The wordmark ghosted through the middle of the deck. `aria-hidden`: the top
strip already announces the workspace name.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `workspaceName` | `string` | — | Rendered under the mark. |

### `MeldAuthShell` — `auth-shell.tsx`

**Start here for any centred single-column screen** — sign-in and every
onboarding step are built on it. Owns the page backdrop, the mark, the heading
pair, and the pixel field, so a screen gets the footer *by construction* rather
than by remembering to add it.

| Prop | Type | Notes |
| --- | --- | --- |
| `title` | `string` | The screen's `h1`. |
| `subtitle` | `ReactNode` | A string renders in the pixel voice. A node passes through **unwrapped**, for live regions. |
| `crest` | `ReactNode` | Replaces the Meld mark — e.g. the setup mascot. |
| `banner` | `ReactNode` | Feedback, rendered between header and body. |

```tsx
<MeldAuthShell title="Create your workspace." subtitle="Add your name and logo">
  <MeldForm action={submit}>…</MeldForm>
</MeldAuthShell>
```

Built from raw elements, not Astryx layout — that's the point of a primitive,
and it drops five Astryx imports per screen.

### `MeldButton` — `button.tsx`

Flat and filled, with the stepped pixel corner. **No stroke on either variant**
— an outline would need a second clipped layer to follow the staircase and
would fight the flatness, so `secondary` is a quieter *fill* rather than an
outline. Hover shifts the fill; nothing lifts. Loading renders a stepped pixel
ellipsis in Pixelify Sans rather than a spinner, which would otherwise be the
only rotating thing in the system.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | — | Required. Visible text and accessible name. |
| `icon` | `ReactNode` | — | Rendered before the label. Mark it `aria-hidden`. |
| `variant` | `"primary" \| "secondary" \| "ghost"` | `"primary"` | Primary is the accent fill, secondary the sunken fill, ghost is text-weight with no fill. None are stroked. |
| `size` | `"md" \| "lg"` | `"md"` | 40px / 48px min-height. |
| `fullWidth` | `boolean` | `false` | |
| `isLoading` | `boolean` | `false` | Disables, sets `aria-busy`, shows the pixel ellipsis. |
| `isDisabled` | `boolean` | `false` | |
| `type` | `string` | `"button"` | Defaults to `button` so it can't submit a form by accident. |

Also accepts every native `<button>` attribute (`name`, `value`, `onClick`, …).
Reflects `data-variant` and `data-size`.

```tsx
<MeldButton label="New room" icon={<PixelPlus aria-hidden />} />
<MeldButton label="Send magic link" type="submit" size="lg" fullWidth isLoading={pending} />
```

### `MeldTextInput` — `text-input.tsx`

Shares Button's stepped corner so controls read as one family. Unlike Button it
keeps a visible edge, painted as a **frame layer** (see above) so the edge
traces the staircase instead of being sliced by it. Focus recolours that edge
to the accent rather than adding a ring, keeping a single shape on screen. Hint
and error text render in the pixel voice — this is exactly the "some text is
pixelated" slot.

Renders `label` → `div.frame` → `input`, then the message. The frame is a real
element; state (`:hover`, `:focus-visible`, `aria-invalid`, `:disabled`) is read
off the input via `:has()`.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | `string` | — | Required and always visible. No placeholder-as-label. |
| `errorMessage` | `string` | — | Sets `aria-invalid` and describes the input. Wins over `hint`. |
| `hint` | `string` | — | Secondary help text. |
| `inputSize` | `"md" \| "lg"` | `"md"` | Named `inputSize` because `size` is a native input attribute. |
| `isDisabled` | `boolean` | `false` | Native `disabled`, not `aria-disabled`. |
| `id` | `string` | generated | Optional. Falls back to a collision-proof `useId()` value; pass one in only when something outside React needs to target the input by id (e.g. a global keyboard shortcut calling `document.getElementById`). |

Accepts every native `<input>` attribute. `onChange` receives the **event**,
not the parsed value — Astryx's `TextInput` handed over the value, so migrated
call sites need `(event) => set(event.target.value)`. Reflects `data-size`.

```tsx
<MeldTextInput
  label="Email address"
  type="email"
  name="email"
  inputSize="lg"
  value={email}
  onChange={(event) => setEmail(event.target.value)}
  errorMessage={fieldErrors?.email}
/>
```

### `MeldFileDrop` — `file-drop.tsx`

Single-file dropzone with the stepped edge. Wraps a **real
`<input type="file">`** rather than reimplementing one: the input stays in the
DOM (visually hidden, not `display: none`) so it keeps its tab position and
native picker, while the zone provides the drop target and visuals. Shows a
thumbnail once a file is picked, and revokes the object URL on change.

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | `string` | Names the input via `aria-labelledby`. |
| `value` / `onValueChange` | `File \| null` | Controlled. |
| `accept`, `name` | `string` | Native passthrough. |
| `hint`, `errorMessage` | `string` | |

> The zone is *also* a `<label>` so clicking it opens the picker. The input is
> therefore named by `aria-labelledby` pointing at the field label — without it
> the accessible name concatenates both into "Workspace logo Drop your
> workspace logo here PNG, JPEG…".

### `MeldSelect` — `select.tsx`

A native `<select>` with `appearance: none`, **not** a custom listbox — the OS
picker beats anything reimplemented here, especially on touch, and keyboard and
assistive-tech support come free. Same frame-layer edge as `MeldTextInput`.
Props: `label`, `options`, `placeholder`, `errorMessage`, `selectSize`,
`hideLabel`, `isDisabled`. Reflects `data-size`, plus `data-empty` while the
placeholder is showing (drives the muted placeholder colour).

### `MeldBadge` — `badge.tsx`

Role/status chip in the pixel voice. Tones: `sky` `pink` `green` `yellow` `red`
`burgundy` `neutral`. Reflects `data-tone`.

> **Don't use `sky` for badges.** It's the accent — the primary button's fill —
> and a badge wearing it competes with the one thing on screen meant to be
> clicked. `getRoleTone()` in `product-roles.ts` deliberately maps no role to it.

### `MeldKeycap` — `keycap.tsx`

A single keyboard shortcut, printed like a physical keycap — the pixel voice
at its smallest, same fill as `MeldBadge`'s `neutral` tone. Used by
`ShortcutLine` (deck) paired with `MeldLabel` so each keycap and its label
stay separate text nodes rather than one shared string.

| Prop | Type | Notes |
| --- | --- | --- |
| `children` | `string` | Required. The key combo, e.g. `"⌘K"`. Printed verbatim. |

### `MeldKindChip` — `kind-chip.tsx`

The stamped kind on a pending row. Pixelify Sans is correct here — this is
metadata, not copy — and the colour is doing the sorting, so the label stays a
single word.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `kind` | `MeldPendingKind` | — | Required. One of: "review", "approve", "failed", "stale". Reflects `data-kind`. |

### `MeldTicketRow` — `ticket-row.tsx`

One row of pending work as it prints on a dark paper ticket. Prints a kind chip,
where the work came from, how long it has waited, the ask in plain language, and
an action slot for navigation links.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `kind` | `MeldPendingKind` | — | Required. One of: "review", "approve", "failed", "stale". Reflects `data-kind`. |
| `source` | `string` | — | Where it came from, e.g. "CHECKOUT · GUEST FLOW". |
| `age` | `string` | — | How long it has been waiting, e.g. "2d". |
| `ask` | `string` | — | The ask, in plain language. Body copy (Archivo, not Pixelify). |
| `children` | `ReactNode` | — | Action links. The deck navigates; it never writes. |

### `MeldColumnHeading` — `column-heading.tsx`

A column's label and its count on one line, count pushed to the trailing
edge. Both set in Pixelify Sans at the smallest size (`var(--meld-text-xs)`)
-- metadata over a stack of tiles or rows, not a page title.

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | `string` | Required, e.g. "PROJECTS". |
| `count` | `number` | Required. Right-aligned. Printed as-is -- unlike `MeldTicket`'s count, not zero-padded. |

### `MeldTicket` — `ticket.tsx`

The dark torn-paper shell that pending work prints onto. Scalloped top and bottom
edges cut by a radial-gradient (transparent notches painted around with paper colour),
dashed rules, a footer slot, and a decorative barcode. Count is zero-padded to two
digits and stops at "99+".

**Important:** This component does not use `clip-path`. Unlike its siblings in this
directory, the clip would slice off the tear strips that sit outside the box showing
the scallops. The torn edge is a repeating radial-gradient positioned absolutely
outside the box so the page shows through the notches.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` | `string` | — | Printed heading, e.g. "PENDING". Set in Pixelify Sans. |
| `count` | `number` | — | Shown top-right, zero-padded to two digits, stops at 99+. Set in Pixelify Sans. |
| `subtitle` | `string` | — | The printed line under the heading. Set in Pixelify Sans. |
| `footer` | `ReactNode` | — | Optional. Sits above the barcode — the on-shift sprites. |
| `children` | `ReactNode` | — | The main content rows. |

### `MeldAvatar` — `avatar.tsx`

Initial avatar. Square with the pixel corner — a circle is the one shape this
system never draws — and the initial itself is set in Pixelify Sans, so the
glyph reads as drawn on the same grid as the square around it.

Colour is **hashed from the name, not random**: a person keeps the same colour
on every screen they appear on. The hash is FNV-1a; a plain `hash * 31 + char`
rolling sum leaves near-identical strings in adjacent buckets, which put
`…@lmu.edu.ng` and `…@gmail.com` on the same colour. Decorative — the name is
always rendered beside it, so it's `aria-hidden`.

### `MeldAgent` — `../meld-agent.tsx`

Asset-backed pixel mascot from the eight-character ensemble in
`apps/web/public/agents/`. Current role defaults are central teal for the
setup mark, pink stretch for Product, lime squat for Research, and purple
pocket for Design. Pass `sprite` when a future agent needs a different cast
member; `appearance` remains a stable semantic selector for compact surfaces.

### `MeldAgentSprite` — `agent-sprite.tsx`

A teammate standing on the ticket. The only animated element on the deck, and
it must never claim work that is not running — `state` comes from in-flight
tasks, never from a guess. Reflects both `agent` and `state` as `data-*`
attributes. The activity meter (vertical bars) renders only in the `working`
state and animates to show real progress. All animations respect
`prefers-reduced-motion`.

| Prop | Type | Notes |
| --- | --- | --- |
| `agent` | `"pm" \| "design"` | Determines visual appearance — design gets a brush tool. |
| `state` | `"working" \| "waiting" \| "idle"` | Reflects task state. Only shows meter while working. |
| `label` | `string` | Caption under the sprite, e.g. "DESIGN · DRAWING". |

### `MeldList` / `MeldListItem` — `list.tsx`

Divider-separated rows. `MeldListItem` takes `label` plus `start` and `end`
slots (avatar, badge). The label takes the slack and truncates, so long values
never make rows different heights.

### Composition — `stack.tsx`

`MeldStack` (gap on the scale, `data-testid` passthrough) · `MeldSection`
(h2 + content) · `MeldSectionHeading` (h3 alone) · `MeldNote` (pixel-voice
secondary copy) · `MeldLabel` · `MeldCode` (large pairing code) ·
`MeldLoadingNote` (animated pixel ellipsis, never a spinner) ·
`MeldActions` / `MeldCenteredActions` / `MeldStartActions` ·
`MeldControlRow` · `MeldCard`.

These exist so **feature code never needs a raw `<div>`** — which the
conventions guard rejects outside this directory.

> `MeldControlRow` resets `width: auto` on its children, and that line is
> load-bearing. Every field primitive sets `width: 100%` to fill a form column;
> as a flex item that becomes a 100% flex basis, three of them can't share a
> line, and the row silently wraps into a stack.

### `MeldBanner` — `banner.tsx`

Feedback in `success` / `error` / `info`, with an optional `description` line.
Errors get `role="alert"` + `aria-live="assertive"` so a failed submit is read
immediately; the others are polite. Reflects `data-status`.

### `MeldChoiceCard` / `MeldChoiceGrid` — `choice-card.tsx`

A large pick-one target (provider choice, starter templates). A real `<button>`
with an explicit `aria-label`, so the accessible name is the **action**
("Connect Codex") rather than the concatenation of everything inside it
("Codex Starting…"). Props: `label`, `title`, `media`, `status`, `isDisabled`,
`onClick`.

### `MeldCodeBlock` — `code-block.tsx`

A command to copy and run. Deep burgundy rather than black — a pure-black panel
is the only thing on a light page that reads as a hole.

### `MeldStatusPixel` — `status-pixel.tsx`

Status indicator with its label. A **square, not a dot** — the system draws no
circles. Tones: `success` `error` `warning` `accent` `neutral`. Pulses while
the thing it reports is still moving, so "in progress" is legible without
reading the label.

### `MeldForm` — `form.tsx`

A `<form>` with the system's vertical rhythm. Thin on purpose — it exists so
screens stop reaching for Astryx's `FormLayout` for what is one flex column.

### `MeldMark` — `meld-mark.tsx`

The logo. One path with `fill-rule="evenodd"` so the four inner stair-steps are
genuine holes, and `currentColor` so it sits on any surface.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `size` | `number` | `48` | Multiples of 16 stay pixel-crisp. |
| `title` | `string` | — | Omit when decorative; the mark then hides from assistive tech. |

> Replaces `public/meld-mark.svg`, which is now unused by the app. That asset
> painted its negative space `#fff` — a visible white square on any non-white
> surface — and carried an internal `prefers-color-scheme: dark` rule. Because
> an SVG loaded through `<img>` evaluates media queries against the OS rather
> than the document, that rule survived the switch to light mode and erased the
> logo entirely on dark-mode machines.

### `MeldPixelField` — `pixel-field.tsx`

Scatter of brand-coloured squares on a 16px grid, densest at the bottom edge so
it reads as rising out of the base of the page. Pinned to the bottom of the
viewport, hidden from assistive tech. Takes no props. Client component.

**Blocks are breakable.** Pressing one removes it and throws off seven shards
that arc outward and fall with gravity before fading — the Minecraft
block-break burst. Broken blocks grow back after 7s (fading in, not popping) so
the field can't be permanently flattened. Uses `pointerdown` rather than
`click`, so a block gives way the instant it's pressed.

Hit-testing detail: the svg spans the full page width, so `.field` sets
`pointer-events: none` and only `.cell` re-enables them. The gaps between
squares stay transparent to clicks — otherwise the field would swallow every
interaction behind it.

`prefers-reduced-motion` suppresses both the shard arcs and the regrow fade.

Pages using it should subtract part of `--meld-pixel-field-height` when sizing
their content area, or content sits on top of the dense rows. **Half is usually
right** — subtracting the full band lifts content clear of optical centre, and
the field's top rows are sparse enough that a little overlap never shows:

```tsx
<Center minHeight="calc(100dvh - var(--spacing-8) - var(--meld-pixel-field-height) / 2)">
  …
</Center>
<MeldPixelField />
```

> **The scatter is seeded, not random.** It renders on the server and again on
> the client; `Math.random()` would produce two different patterns and a
> hydration mismatch. A fixed-seed mulberry32 PRNG generates the cells once at
> module load. A test pins this — don't swap it for `Math.random()`.

Colour weighting lives in `PALETTE`: pink appears 3×, yellow 2×, and red, sky,
green, burgundy once each. An even split reads as confetti; one dominant hue
with accents reads as a deliberate pattern.

### `MeldPeekCard` — `peek-card.tsx`

The top of a project's most recent document, poking out from behind
`MeldProjectTile`. Decorative on purpose: it's a shape cue, not a readable
preview, so it renders rule lines (or a row of screen placeholders for the
`screens` shape) rather than real text. Rotated a few degrees so it reads as
tucked behind the tile rather than stacked on top of it.

| Prop | Type | Notes |
| --- | --- | --- |
| `shape` | `MeldPeekShape` (`"doc" \| "screens" \| "brief"`) | Required. `"screens"` renders a row of blocks; `"doc"`/`"brief"` render rule lines, with `"brief"` using a different line-width rhythm. Reflected as `data-shape`. |
| `color` | `MeldTileColor` | Required. Tints the top accent strip. Reflected as `data-color`. |

`aria-hidden` — always rendered inside a `MeldProjectTile`, which already
carries the accessible name.

### `MeldProjectTile` — `project-tile.tsx`

A project as a container with its contents spilling out, not an icon. The
colour is a corner glow rather than a fill, so a row of tiles reads as one
family instead of a paint chart. Pass a `MeldPeekCard` as `peek` to get the
"document poking out from behind" composition described at the top of this
file.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `name` | `string` | — | Required. Set in Archivo (default), not Pixelify — this is a title, not metadata. |
| `color` | `MeldTileColor` | — | Required. Ten members mirroring `PROJECT_COLOR_OPTIONS` in `features/projects/schemas.ts` — keep the two in sync, or a real project colour renders as no colour. Reflected as `data-color` on the wrapper. |
| `roomCount` | `number` | — | Required. Drives the singular/plural count line: "1 room" vs. "N rooms". |
| `updatedLabel` | `string` | — | Required. Relative time, already formatted, e.g. `"2h"`. |
| `isLive` | `boolean` | `false` | An agent is working in this project right now. Shows a "LIVE" chip at the top-leading corner (`data-testid="tile-live"`). |
| `unreadCount` | `number` | `0` | Shows a badge at the top-trailing corner (`data-testid="tile-unread"`) when greater than zero; hidden at zero. |
| `peek` | `ReactNode` | — | A `MeldPeekCard`, rendered ahead of the tile so it pokes out from behind it. |

The live marker and unread badge anchor to opposite corners (leading vs.
trailing) at the same `inset-block-start`, and each carries its own
`data-testid` — both can be showing at once, so they must never share a
position or a hook.

Count line and the `LIVE`/unread badges are Pixelify Sans (`var(--meld-font-pixel)`)
— metadata, not copy. The project name stays Archivo.

### `MeldRevealWipe` — `reveal-wipe.tsx`

Full-viewport sibling of `MeldPixelField`, used for exactly one moment:
workspace setup navigating into a freshly created workspace. It is
deliberately **not** a loading screen — there's nothing real to wait on by
then (workspace creation is already durably committed, and the destination's
own fetch is a handful of cheap queries) — so instead of stalling for a fixed
duration, it's a brief transition that plays over whatever's already
navigating underneath it.

Every block is its own element that does nothing but fade its own opacity —
the same fade the footer field already uses to grow broken blocks back in,
just choreographed as a sweep instead of scattered respawns. Bottom-row
blocks get the shortest delay, top-row blocks the longest, so the screen
appears to fill from the bottom up and, a beat later, clear the same way —
entirely through timing. Nothing translates or slides.

| Prop | Type | Notes |
| --- | --- | --- |
| `onComplete` | `() => void` | Fires once the clear phase finishes and the screen is fully faded out again. Called at most once. |

Total cycle is a fixed ~1.5s (not configurable — see `SWEEP_MS` / `FADE_MS` /
`HOLD_MS` in the source): cover, hold, clear. Does **not** check
`prefers-reduced-motion` itself — the caller decides whether to mount it at
all, and should only do so once motion is confirmed welcome:

```tsx
{!prefersReducedMotion && <MeldRevealWipe onComplete={handleDone} />}
```

> **Viewport size is read post-mount, via `useIsMounted`, not `useEffect` +
> `useState`.** Unlike the footer field, this one only ever exists
> client-side, so there is no server/client scatter to keep in sync — but
> `window.innerWidth`/`innerHeight` still are not available during the
> server render or the pre-hydration client pass. Reading them straight into
> a `setState` inside a bare `useEffect` reads as exactly the derived-state
> anti-pattern React's own lints now catch; gating the read behind
> `useIsMounted()` and computing the grid with `useMemo` avoids an effect
> entirely.

---

## Not built yet

Needed before the denser surfaces (rooms, canvas, PRD) can migrate:
Card/notched container, Heading/Text, Chip/Badge, Select, Checkbox, Dialog,
Banner, nav rail. Icons come from the existing `@/ui/pixel-icons` set
(HackerNoon Pixel Icon Library — 65 of 248 glyphs exported so far).

## Where things live

| Path | What |
| --- | --- |
| `tokens.css` | Palette, spacing, type scale, the notch. Imported once in `app/layout.tsx`. |
| `app/global.css` | Font families (`--font-family-body`) and display tracking. |
| `ui/pixel-icons.tsx` | Pixel icon set. Not part of this directory but part of the language. |
