# Native Taste screen (Orion Mac app)

Status: draft from brainstorm 2026-11-10 · Owner: Nicholas Odunsi
Builds on: `2026-11-07-taste-profile-design.md` (the board, learning, suggestions),
`2026-11-09-native-inspiration-design.md` (native screen pattern, Shelf key, side panel).
Mockups (local, not committed): `.superpowers/brainstorm/74815-1794305717/content/`
(`taste-layout-mix.html`, `taste-editing.html`, `taste-composer.html`).

---

## Part A — Read this first (plain language)

### Why

Taste is still the website shown inside the Mac app, and its editor is a plain
text box. That assumes you already know design words like "density" or "layout
habits". This build does two things:

1. Rebuilds Taste as a real SwiftUI screen, like native Inspiration.
2. Makes every part of your taste **explain itself and be pickable**, and gives
   you a **composer** to hand Orion anything (words, files, links) so it fills in
   the small details for you.

### What you'll see

- **Four plain-English chapters** instead of eight jargon tiles: *How it looks*
  (design language, colour, typography), *How it feels* (density, spacing),
  *How it's put together* (layout habits, signature details) and
  *What to steer clear of* (you avoid). Each row has a one-line explanation.
- **A live sample screen** (a sign-in screen) pinned on the right. It restyles as
  your taste changes, so "airy" or "packed" is something you can see.
- **Tap a row** and the chapter list swaps for an **edit panel** (same slide
  as Inspiration's side panel, with a **‹ Back** link). No new page. The sample
  stays put and updates live.
- **Edit by picking, not typing.**
  - *Density, Spacing, Typography weight and tracking:* labelled mini-screens.
  - *Colour:* swatches, one marked as the accent, quick starts (Black & white,
    Warm neutrals, Soft pastels) and "Pull from an image…" from your library.
  - *Layout habits, Signature details, You avoid:* each item with a short
    explanation, one-tap suggestions, and "describe one in your own words".
  - Every panel shows **why Orion chose this** ("11 of your 15 images lean
    airy"), a plain-words box, **Done**, and **Let Orion decide again**.
- **The composer**, docked at the bottom. Type, attach files, paste links, or
  all at once, then press **Read it**. Orion answers with **cards**, each
  saying which part changes, from what to what, and where it found it
  ("Brand-guide.pdf, page 3" or your own words). **Keep**, **Remove**, tap to
  edit, or **Keep all / Remove all**. You can also reply "make it less airy" to
  get new cards. While you decide, the sample previews the suggestions.
- **Apple design rules** (from Apple's Human Interface Guidelines), for the
  screens Orion designs **inside your projects**, not Orion's own app. Two parts:
  - A **"Make it feel like Apple"** quick start in the composer and on each
    panel. It fills your tiles with Apple-style values (regular-to-bold type,
    generous spacing, one accent). It is a shortcut: you can Keep or Remove each
    card, and once kept it is simply your taste.
  - An **"Apple rules"** switch on the Taste screen, with its rules listed in
    plain language ("Buttons are at least 44 pt tall", "No thin type", "Text is
    never smaller than 11 pt on iPhone"). When it is on, Orion follows these
    whenever it designs a screen for an iPhone, iPad or Mac app, **whatever your
    taste says**. Your taste decides the look. The rules protect usability.
- The existing learning from your saves still works. Its "Keep it / Not me"
  cards now appear in the same card tray as composer cards.

### Decisions from the brainstorm

| Question | Decision |
|---|---|
| Ways to feed taste | All of: pictures on every tile, a composer for words/files/links, learning from saves (D) |
| Screen layout | Chapters on the left, sticky live sample on the right (A of the mix) |
| What a tap does | Panel swap in the same column, for every tile (not accordion, not a new page) |
| Add-to-taste entry | One composer (not two tabs), docked at the bottom |
| Dropped files and links | Feed taste only. A small **Also save images to Inspiration** toggle, off by default |
| Apple's HIG | Both: a "Make it feel like Apple" quick start and an always-on "Apple rules" guardrail layer, applied to screens designed in your projects (not Orion's own UI) |
| Trust | Nothing changes until you tap Keep. Every card shows its source |

### Not in this build

Per-project tastes, a "turn taste off for this room" switch, exporting taste,
and editing from the web (the website's Taste tab keeps working as is).

---

## Part B — Exact behaviour

### B1. Screen structure

`TasteScreen` (SwiftUI, replaces the web frame for the `.taste` destination).

| Unit | Job | Depends on |
|---|---|---|
| `TasteModel` (`@Observable`) | Board, version, pending cards, composer state, saves | `TasteClient` |
| `TasteClient` | Calls the taste API with the Shelf key | Shelf key, base URL |
| `TasteChaptersView` | The four chapters and their rows | `TasteModel` |
| `TasteEditPanel` (one view per control kind) | Panel swap content; calls `model.apply(op)` | `TasteModel` |
| `TasteSampleView` | Pure function of the board (+ pending preview) to a styled sign-in screen | board value only |
| `TasteComposer` + `TasteCardTray` | Compose, attach, read, show/decide cards | `TasteModel` |

`TasteSampleView` takes a board and returns a view, so it is tested by feeding
boards and checking spacing/colour/weight values, with no network.

### B2. Row to control mapping

| Row (tile key) | Control | Plain explanation |
|---|---|---|
| Design language | Word chips + suggestions | "The overall mood of your screens" |
| Colour | Swatches with roles, quick starts, pull from image | "The few colours you keep coming back to" |
| Typography | Weight and tracking pickers (mini type samples) + note | "How heavy and tight your lettering is" |
| Density | 3 labelled mini-screens (maps onto the existing 5 values: airy, light=between, balanced, compact=between, dense) | "How much is on screen at once" |
| Spacing | 3 pictures: tight, comfortable, generous | "Breathing room between things" |
| Layout habits | Item cards + suggestions | "How you like screens arranged" |
| Signature details | Item cards + suggestions | "Small touches you repeat" |
| You avoid | Item chips + add | "Things Orion should never do" |

All limits from the taste-profile spec (B1 there) are unchanged. The Density
picture control writes one of the five stored values; the two in-between values
are reachable by a small "a bit more / less" nudge under the pictures.

### B3. Editing

- Picking a value calls the existing single-tile save with the board's
  `expectedVersion`. A conflict shows "Your taste changed in the meantime" and
  reloads. Invalid input shows the limit that was exceeded.
- A tile the person edited is "locked" as before (taste-profile spec:
  Orion won't suggest changing it until 5 more saves).
- **Let Orion decide again** clears the tile lock now and the next normal refresh
  may suggest again (it does not force an immediate rethink; the refresh job's
  save-count rules are unchanged).
- Plain-words box: sent to the same interpretation call as the composer, scoped
  to that tile, and returns cards (never writes directly).

### B4. Composer

- Inputs: free text (max 4,000 chars), up to 6 attachments (PDF, DOCX, TXT/MD,
  PNG/JPG/WebP; 10 MB each), and URLs (max 3).
- **Read it** sends text, extracted file text and fetched link text to the
  interpretation call (DeepSeek, text only, like the existing taste writer).
  Images are read through the existing image labeller (`sorting/deepseek-labeler.ts`),
  which already sends the image to a vision model and returns device, screen type,
  patterns, light/dark theme, up to 5 hex colours, style words and a 1–3 sentence
  note on layout, hierarchy, spacing and type. That is enough for colour, mood and
  layout habits, and spacing/density is read from its description, the same way the
  taste board already does. Checked 2026-11-10; no extra vision step is needed.
  Dropped images get labelled by this step before interpretation.
- All input text is untrusted data (same rule as the taste prompt). Links are
  fetched server-side with the existing SSRF protections, size-capped, text only.
- Output: 0–8 **cards**, each `{tile, op, value, reason, source}` where
  `source` is `{kind: "file"|"link"|"words", name, locator}` (e.g. page 3, or the
  quoted phrase). Same operations and validation as suggestions today
  (`applyTasteOperation`); anything invalid is dropped, and if every card is
  invalid the user sees "Orion couldn't find anything usable".
- Cards go into the existing `taste_suggestions` table with a new
  `origin` value (`composer`), so the existing Keep / Not me logic, rejected-key
  memory and "You avoid" behaviour apply to them unchanged. **Remove** here is
  the same action as **Not me**.
- While a card is pending the sample renders the board with that card applied
  (preview only; nothing is saved).
- **Also save images to Inspiration** toggle: when on, dropped images go through
  the normal Inspiration upload; when off, files are read and discarded after
  the call (not stored).
- Follow-up replies ("make it less airy") send the reply with the current
  board and the pending cards, and return replacement cards.

### B5. Data and access

- New routes under `/api/shelf/taste` (Shelf key, like Inspiration):
  `GET` board + version + pending cards, `PUT /tile`, `POST /suggestions/:id`
  (keep | remove), `POST /compose` (multipart: text, files, urls), `POST /redecide`.
  They reuse the logic behind today's `taste-actions.ts`; the server actions and
  routes share the same functions so the web Taste tab keeps working.
- This widens the Shelf key again: it can now read and change the taste board
  and run composer reads. It still cannot read messages, PRDs or canvases.
- Offline: the last loaded board shows read-only with "Offline"; editing and the
  composer are disabled until back online.

### B5a. Apple rules (HIG)

Source: Apple Human Interface Guidelines (Layout, Typography, Color, Materials),
read 2026-11-10. We store a short rulebook of our own wording, not Apple's text.

- **Switch:** `apple_rules` (boolean, default **on**) on the taste profile, shown
  on the Taste screen with its rules listed. Changing it is a normal tile-style
  save with the same version check.
- **When it applies:** only when the target is an Apple platform. The existing
  `infer-target` already tells iPhone/iPad/Mac targets from web/Android; web and
  other targets get no Apple block.
- **Where it goes:** a second short block, `APPLE RULES`, in `composeInstruction`
  right after the taste block, with this precedence stated in the block itself:
  *Apple rules beat taste on usability (size, contrast, touch targets); taste
  beats Apple on look (colour, mood, spacing within limits); a room design
  system still wins on brand colours and fonts.*
- **Budget:** the task instruction is capped at 4,000 characters and the taste
  block at 700. The Apple block is capped at **450 characters** and is trimmed
  after inspiration lines but before the taste block (taste is the owner's words;
  the rules are generic).
- **First rulebook (kept deliberately short):**
  - Touch targets at least 44 × 44 pt on iPhone/iPad; Mac controls at least the
    standard size.
  - Body text 17 pt on iPhone/iPad and 13 pt on Mac; nothing under 11 pt (10 pt Mac).
  - No Ultralight, Thin or Light weights; use Regular, Medium, Semibold or Bold.
  - At most two typefaces. Show hierarchy with weight, size and colour.
  - Most important content top and leading; align related things, group with
    space, reveal secondary things on demand.
  - Controls look distinct from content. Use semantic colours so Light and Dark
    both work, and keep text contrast readable.
- **Conflict with taste:** if the taste asks for a weight the rules forbid (for
  example "light" typography), the block tells the AI to use Regular and the
  panel shows a small note: "Apple rules use Regular instead of Light on iPhone".
  Nothing in the saved board is changed.
- **"Make it feel like Apple" quick start:** produces ordinary composer cards
  (typography `regular`, spacing `generous`, density `airy/balanced`, one accent,
  layout habit "most important content at the top and leading edge"). It goes
  through the same Keep / Remove flow and writes to the board only when kept.
- **Tests:** block formatting and the 450-character cap; applies only on Apple
  targets; precedence wording present; weight-conflict note; off switch removes
  the block.

### B6. Errors

| Situation | What the user sees |
|---|---|
| DeepSeek key missing / down | Composer disabled with "Add a DeepSeek key to let Orion read things"; editing by pictures still works |
| File unreadable / too large | The chip turns red with the reason; the rest still reads |
| Link blocked or empty | Same, per link |
| Model returns invalid output | Whole batch discarded, "Orion couldn't read that, try again" |
| Version conflict on save | "Your taste changed in the meantime", reload, keep the pending edit visible |

### B7. Testing

- `TasteSampleView` and the Density/Spacing mapping: unit tests over boards.
- `TasteModel`: save, conflict, keep/remove, preview-applied-board, with a fake client.
- API routes: contract tests with the existing fake mode, including invalid
  model output and SSRF-blocked links.
- Visual check through `apps/mac/scripts/preview.sh` (demo data).

### B8. Build order (for the plan)

1. Taste API routes over the existing logic (no UI change), plus the `apple_rules` column and the Apple block in `composeInstruction`.
2. Native screen: chapters, sample, panel swap with picture controls.
3. Composer + card tray (words first, then files, then links).
4. "Let Orion decide again", offline state, polish.
