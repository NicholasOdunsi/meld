# Taste as a style-guide board (Orion Mac app)

Status: draft for owner review · 2026-11-10 · Owner: Nicholas Odunsi
Changes: the **screen layout and the list of parts of your taste** in
`2026-11-10-native-taste-design.md`. Everything else there stays: the composer,
the cards with sources, the Apple rules switch, learning from your saves.
Builds on: `2026-11-07-taste-profile-design.md` (board, learning, suggestions).
Mockups (local, not committed): `.superpowers/brainstorm/61236-1794328758/content/`
(`taste-structures-a-b-c.html`, option **A**; `taste-board-v3-motion-craft.html`).
Reference skills studied: `emilkowalski/skills`, `jakubkrehel/skills` (read, not installed).

---

## Part A — Read this first (plain language)

### Why

The native Taste screen listed eight rows plus a sample screen plus a card tray
plus a composer. It felt like "so many things". Two ideas fix that:

1. **Treat Taste like a brand guide.** Each part of your taste becomes one big
   tile that *shows* the thing (a bold "Aa", nested rounded corners, a button
   that really presses) instead of a row of words.
2. **Colour is not your taste.** Every project has its own design system and
   its own colours, and the design system wins. Taste is about **how things
   feel**: movement, lettering, shape, space, voice. So colour leaves the screen.

### What you'll see

Six tiles, plus two thin strips:

| Tile | What it shows | Where its data comes from |
|---|---|---|
| **Motion & feel** | The word (Instant, Snappy, Smooth or Playful) and a toast and button **playing live** at that speed | New. **From the motion rules in the skills you sent**, not from images. You pick the feel (default Snappy) |
| **Lettering** | "Aa", a heading, body text, and numbers that line up | Today's Typography |
| **Shape** | Nested rounded corners, soft shadows or hairlines | New (corners and depth), plus today's Signature details |
| **Space** | A density picture, plus gaps | Today's Density, Spacing and Layout habits |
| **Voice** | The tone (Plain, Warm, Formal, Playful) with two example lines | New. **From the writing rules in the skills you sent**, not from images. You pick the tone (default Plain) |
| **Steer clear of** (strip) | Struck-through chips | Today's You avoid |
| **Craft rules** (strip, locked) | "8 rules, always on" | Fixed list built into Orion |

- **Mood words** ("minimal · bold-type", today's Design language) show as a small
  line under the title. Tap it to edit.
- **Preview on a screen** (button, top right) opens a window with two sample
  screens (sign-in and an invoices list) in your taste, moving the way you
  chose. This replaces the old always-on sample.
- **Tap a tile** and a panel slides in from the right (same as Inspiration).
  You edit by picking, as in the earlier spec. The board stays visible behind it.
- **Suggestions** from Orion land **on the tile they change**, with Keep and
  Remove right there, and a pill "✦ 2 suggestions · Keep all" in the header.
  The separate card tray goes away.
- **The composer bar** stays docked at the bottom (collapsed to one slim bar,
  grows when you click it or drop a file). Unchanged.
- **Still learning**: the board shows as empty dashed tiles and fills in as you
  save images.

### Craft rules (always on, read-only)

The floor under every screen Orion designs for you. **Your taste decides the
look. These protect how it feels to use.** You can open the tile and read why
each rule exists. You cannot switch them off. The existing **Apple rules**
switch lives inside this tile.

1. Pressing a button scales it to 0.96.
2. Things leave faster and smaller than they arrive.
3. Things used constantly (keyboard shortcuts, hovering rows) never animate.
4. Reduced Motion is respected (a fade, not movement).
5. Numbers that change line up (tabular figures).
6. Nested rounded corners add up (outer = inner + padding).
7. Tap targets are at least 44 px.
8. Errors and warnings are always calm and plain, and say how to fix it, whatever tone you picked.

### Where each part comes from

**Images teach only the visual parts.** Your saved images are for visual
learning: Lettering, Shape, Space, mood words and Steer clear of. An image can't
show how something moves or how it sounds, so **Motion and Voice never come from
your saves.**

**Motion and Voice come from the skills you sent.** Emil Kowalski's motion rules
and Jakub Krehel's motion and writing rules define what each personality means
in exact numbers, and what every personality must never do. You choose the
feel (Motion starts on Snappy, Voice on Plain). The skills supply the rules
behind it. Your words or a brand guide in the composer can also suggest a pick,
as a card you Keep or Remove.

The tone you pick only bends **low-stakes** copy (success messages, welcome
text, empty states). Errors, warnings and anything destructive stay calm and
plain, whatever you picked.

### Decisions (change any you disagree with)

| Question | Decision |
|---|---|
| Layout | Option A: six big tiles, two thin strips (not scrolling page, not one sentence) |
| "In use" sample tile | Removed; replaced by the Preview on a screen button |
| Colour | Removed from the screen. **Kept in the stored data** so the website's Taste tab keeps working. Orion ignores it when a project has its own design system |
| New stored parts | `motion`, `shape`, `voice` (three small additions) |
| Source of Motion and Voice | The skills you sent, not learning from images. Images are for visual taste only |
| Exact timings and the 0.96 press | Jakub Krehel's values (he and Emil Kowalski differ slightly: 0.96 vs 0.97, different curves). Voice rules come from Jakub's writing skill |
| Playful | One small overshoot, 450 ms. Our own guess, to be judged by eye in the app |

### Not in this build

Per-project tastes, exporting taste, editing from the web, any colour editing
in the Mac app, learning Motion or Voice from images.

---

## Part B — Exact behaviour

### B1. Stored board (what changes)

`TasteBoard` gains three **optional** fields. A board without them reads as the
defaults, so no data backfill is needed and the website keeps working (it
ignores fields it doesn't know).

| Key | Type | Default | Notes |
|---|---|---|---|
| `motion` | `instant` · `snappy` · `smooth` · `playful` | `snappy` | scalar, `set` only |
| `shape` | `{ corners, depth }`: `corners` ∈ `sharp`, `soft`, `round`; `depth` ∈ `shadows`, `hairlines`, `flat` | `soft` / `shadows` | scalar object, `set` only |
| `voice` | `{ tone, note }`: `tone` ∈ `plain`, `warm`, `formal`, `playful`; `note` 0–80 chars | `plain`, empty note | scalar object, `set` only |

All existing keys and limits from the taste-profile spec (B1) are unchanged,
including `colors`. Tile keys for suggestions, locks and edits widen from 8 to 11.

**Needed changes outside the Mac app**
- `@meld/contracts`: add the three fields (optional with defaults) to
  `TasteBoardSchema`; add `motion`, `shape`, `voice` to `TasteTileKey`;
  `TasteSuggestionSchema` allows only the `set` operation on them.
- One migration widens the tile-name check on `taste_suggestions` and the
  tile validation in the edit and capture functions
  (`20261108000001`, `20261110000002`, `20261110000003`) from 8 names to 11.
- Learning from saved images (DeepSeek refresh): may propose `shape`; never
  `motion` or `voice`, because images can't carry them.
  Composer reads (words, brand guides) may propose all three, and cite their source as today.
  Neither may propose `colors` any more for Mac users (see B4).

### B2. Tile contents and controls

| Tile | Shown value | Panel controls (picking, not typing) |
|---|---|---|
| Motion & feel | Name, one-line meaning, live toast and button loop | Four option cards, each playing live. "Why Orion chose this" |
| Lettering | "Aa", heading, body, tabular numbers | Weight and tracking pickers with mini samples, note (as today) |
| Shape | Nested-corners picture, depth word, signature-detail chips | Corners (3 pictures), depth (3 pictures), signature-detail items with one-tap suggestions |
| Space | Density picture, spacing word, up to 3 layout-habit chips | Density 3 pictures plus "a bit more / less" nudge, spacing 3 pictures, layout-habit items |
| Voice | Tone, two example lines | Four tone cards, each showing an example success or empty-state line in that tone, plus a note. A fixed line underneath: "Errors stay calm and plain." |
| Steer clear of (strip) | Up to 3 struck-through chips, "+N" | Item chips and add (as today) |
| Craft rules (strip) | "8 rules ›" | Read-only list grouped Motion / Type and surfaces / Touch / Words, each with a one-line reason; Apple rules switch |

Every editable panel keeps: why Orion chose this, a plain-words box that
returns cards (never writes directly), **Done**, **Let Orion decide again**.
Saving a tile locks it, as today. Mood words edit in a small panel from the
header line.

### B3. Live motion

Values come from the two skills (Jakub's where they differ). Craft layer, pure function `TasteMotionSpec(motion) → timings`:

| Personality | Enter | Notes |
|---|---|---|
| Instant | opacity only, 0 ms | no movement |
| Snappy | 150 ms, `cubic-bezier(0.2, 0, 0, 1)`, 12 pt rise, 4 pt blur | default |
| Smooth | 300 ms, same curve | |
| Playful | 450 ms, one overshoot of about 3% | no bounce on icon swaps |

Fixed for every personality: press 0.96 over 150 ms ease-out (never on disabled
controls); exit 150 ms, 12 pt up, 4 pt blur; stagger 100 ms only on rare,
staged entrances; nothing animates for keyboard-triggered or constantly repeated
actions. The Motion tile and option cards loop a toast and a button press on a
2.4 s cycle. With macOS **Reduce Motion** on, loops stop and show the end state
plus the duration label; movement becomes a fade.

### B4. Suggestions on tiles

- A pending suggestion draws a dashed ring on its tile and a footer with a
  one-line headline plus **Keep** and **Remove**. The tile also shows a small
  tag of the change ("Dense → Airy"). **Keep all / Remove all** in the header.
- A suggestion for `designLanguage` shows on the mood line. One for `layoutHabits`
  or `signatureDetails` shows on Space or Shape. One for `colors` is **not shown**
  in the Mac app and is left undecided (so the website still sees it).
- Nothing changes until Keep. Hovering a suggestion previews it in the Preview
  sheet only (the sample tile no longer exists).
- The Apple quick start (`origin = preset`) no longer fills colours; it sets
  Lettering (regular-to-bold), Space (generous), Shape (round, soft) and
  Motion (smooth).

### B5. Screen structure (Swift)

| Unit | Job | Depends on |
|---|---|---|
| `TasteBoardGrid` | Lays out the six tiles and two strips; collapses to two columns below 720 pt | `TasteModel` |
| `TasteTileView` (one per tile) | Specimen drawing plus the ring and footer for a pending suggestion | board value, pending suggestion |
| `TasteEditPanel` (existing, restyled) | Right-side panel, one control set per tile, `model.apply(op)` | `TasteModel` |
| `TasteMotionSpec`, `TasteCraftRules` | Pure data: timings, the eight rules and their reasons | nothing |
| `TastePreviewSheet` | Two sample screens from `TasteSampleStyle(board)` plus `TasteMotionSpec` | board value |
| `TasteComposerView`, `TasteCardTray` | Composer unchanged. The tray's cards now render on tiles | `TasteModel` |

Removed from the Mac UI: the Colour panel and its quick starts, "Pull from an
image", the left-column chapter list, the always-on sample column, the separate
card tray, the "In use" tile. `TasteSampleStyle` is extended with motion and
shape and reused by the preview sheet.

### B6. Edge cases

- **Offline:** one grey line under the title; tiles readable, edits disabled.
- **Learning, no board yet:** dashed empty tiles plus the "still learning" card
  with progress (saved images out of the number needed); composer hidden.
- **Version conflict on save:** unchanged ("Your taste changed in the meantime").
- **Old board without the new fields:** shows defaults; first save writes them.
- **Window narrower than 720 pt:** two columns, craft strip last.

### B7. Testing

- Swift unit tests: board decode with and without the new fields; tile mapping
  (which stored keys feed which tile); `TasteMotionSpec` for all four values;
  suggestion routing (including "colors is not shown"); `TasteSampleStyle`
  with motion and shape.
- Contracts tests: schema accepts and defaults the new fields; `set` only on
  them; old boards still parse.
- pgTAP: tile-name checks accept the new keys, reject unknown ones; locks work
  for the new keys.
- Visual check by running `apps/mac/scripts/preview.sh` and capturing the window
  (as for Inspiration): board, a tile panel, suggestions on tiles, preview
  sheet, still-learning, Reduce Motion on.
- Manual: confirm Playful and the Motion loops feel right by eye.
