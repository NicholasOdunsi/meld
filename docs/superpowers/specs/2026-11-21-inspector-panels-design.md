# Inspector panels: screen Tweak, shape properties and Code view

**Date:** 21 November 2026 · **Branch:** `NicholasOdunsi/canvas-powers-live-paste` (stacked on Plan 2/3)

## In plain words

Today the right-hand panel on the canvas is awkward. You must press "Pick" before you can select anything. The fields are blank or show code words (`text-white`, `Rounded-md`). Undo and Redo float in an odd spot. The panel is open even when nothing is selected. The Code tab does not look like a real code editor. Shapes you draw have only a tiny bar underneath them.

This work makes the panel behave like a design tool's inspector (Figma-style):

1. **Selecting is automatic.** Click an element in an open screen to select it. No Pick button.
2. **The panel only appears when there is something to edit.** Select an element, a drawn shape, or press Code on a screen. Otherwise no panel.
3. **Every field shows a real value** (a number, a font name, a colour), read from what the screen is actually showing.
4. **Real controls:** a font dropdown, a weight dropdown, a colour picker, number fields with units.
5. **Plain-language wording** everywhere. No code names, no "nonnegative".
6. **Shapes get their own panel** (fill, stroke, thickness, style, roundness, opacity). The bar under shapes goes away.
7. **Code view looks like a proper editor:** dark theme, line numbers, monospace, syntax colours.
8. **Undo and Redo move into the panel header** beside Close.

Out of scope: changing fonts beyond Sans/Serif/Mono, embedding web fonts, position/size numbers for shapes, chat integration ("Add to chat" stays as is).

## Decisions made with the owner

| Topic | Decision |
|---|---|
| Font | **Changeable**, from three families: Sans, Serif, Mono. Show the font actually rendering ("Showing: Inter"). Screens cannot download fonts (frame security policy allows only embedded fonts), so only always-available families are offered. |
| Colour | Popup with a palette grid, a "Used on this screen" row and a hex box. No free colour wheel. The Astryx design library has no colour picker, so this is a small custom component built from Astryx parts. |
| Shape panel | The "everyday set": fill, stroke colour, stroke thickness, stroke style (solid/dashed/dotted), corner roundness, opacity. |
| Order | Screen panel first, shape panel second (it reuses the colour picker). |

## Behaviour

### Selecting inside a screen (replaces Pick)

- When a screen is awake (live) and the Tweak tab is the active tab, a click on an element **selects** it instead of triggering it. The selected element gets an outline.
- A small **Interact** toggle in the panel header (and the selection bar) switches the screen back to normal behaviour so the user can try buttons and links. Interact is off by default; it turns itself off when a new element is picked.
- Clicking an empty part of the screen, or pressing Escape once, deselects. Escape with nothing selected sleeps the screen (existing behaviour).
- The existing bridge pick mode stays; the board now turns it on automatically while the Tweak tab is active and Interact is off.

### When the panel appears

The panel is visible only when one of these is true, otherwise it is not rendered and the canvas gets the full width:

- an element inside a live screen is picked (Tweak tab);
- a drawn shape or text is selected (shape tab);
- the user pressed **Code** on a selected screen (Code tab). Code stays open until closed.

Waking a screen no longer opens the panel. A compile failure still opens Code (existing rule).

### Panel header

`Screen` title · Undo · Redo · Close. Undo/Redo are icon buttons with tooltips, disabled when unavailable, and they also answer ⌘Z / ⇧⌘Z while the panel has focus. They are removed from the body of the panel.

### Real values

The live frame's bridge, on every pick and after every edit, reports computed values for the picked element: font family (first family name), font size, font weight, text colour, background colour, width, height, padding, gap, border radius. These are shown in the fields even when the source does not state them.

Each field also knows whether it can be edited from the panel: it can if the value is a plain literal in the code, or if the property is not written yet and can be added. If the value comes from code logic, the field is dimmed with the line "Set by the screen's code. Change it in Code."

Editing a property that is not written yet **adds** it to the element in the source. (Verify during planning that the current editing engine supports adding; if it does not, add it as part of this work with tests.)

### Controls

| Field | Control |
|---|---|
| Text | text box |
| Font | dropdown: Sans, Serif, Mono. Caption "Showing: <real font name>" |
| Size | number, unit `px`; ↑/↓ step by 1 |
| Weight | dropdown: Light 300, Regular 400, Medium 500, Semibold 600, Bold 700, Extra bold 800 |
| Text colour, Background | colour field: swatch + hex; click opens the colour popup |
| Width, Height, Padding, Gap, Corner radius | number, unit `px`. An automatic size shows the real number with an "auto" tag |

Sections: Content, Typography, Layout, Appearance. A field is shown only when it means something for the picked element (for example Gap only for an element that lays out children). Fields that do not apply are hidden, not disabled; fields that apply but are controlled by code are shown dimmed with the "Set by the screen's code" line.

### Wording

- Number error: "Use a whole number, like 8."
- Colour error: "Use a colour like #1A2B3C."
- Weight error: "Choose a weight from the list."
- Computed: "Set by the screen's code. Change it in Code."
- Nothing picked, Tweak open (only reachable after deselecting): the panel closes instead of showing a hint.
- Raw class names (`bg-red-500`, `Rounded-md`) are never shown.

### Colour popup

Palette grid (neutrals, then red, orange, yellow, green, teal, blue, purple, pink in a few shades), a row "Used on this screen" (distinct colours found in the screen's source and rendered styles, max 8), and a hex box with validation. Selecting a swatch applies immediately. Keyboard: arrow keys move through swatches, Enter applies, Escape closes.

### Shape panel

Appears in the same panel slot when a drawn shape (rectangle, ellipse, diamond, triangle, line, arrow, freehand) is selected; text shows Colour, Size (S/M/L as numbers in px) and Weight is not offered. Fields: Fill (none or a colour; turning fill on sets a solid fill), Stroke colour, Stroke thickness (1–8 px), Stroke style (solid, dashed, dotted), Corner roundness (square/rounded), Opacity (0–100%). Changes go through Excalidraw's own scene update so they are undoable with the board's own undo. The bar under shapes (`SelectionPill` colour dots, Thin, Bold, S/M/L) is deleted for shapes and text; the screen action bar (Open live, Code, Add to chat) stays.

### Code view

Replace the current look with a CodeMirror theme in the project's dark/light palette: line numbers, active-line highlight, monospace font, bracket matching, and a syntax highlight style (keywords, strings, numbers, comments, tags, attributes, functions, properties, types each with their own colour; contrast at least 4.5:1 against the editor background). Dark by default, follows the theme. Layout: full panel width, file tabs above (when more than one file), Copy and Download as icon buttons in the editor's top bar, diagnostics shown as a compact list under the editor with line numbers. Keep: all existing keyboard behaviour, read-only handling and `aria-label="Source for <file>"`.

## Components (units and responsibilities)

- `live/inspector-values.ts` (new): the computed-values message shape and the mapping from rendered values to field display values (font name → Sans/Serif/Mono, weight number → name).
- Bridge (`packages/screen-runtime/src/runtime/bridge.ts`): report computed values with each `picked` message and after edits; accept `select-mode` (auto selection) and `interact` flag.
- `live/colour-field.tsx` + `live/colour-palette.ts` (new): colour popup, shared by screen and shape panels.
- `live/tweak-panel.tsx` (rewrite): sections and controls above.
- `live/live-panel.tsx`: header with title, Undo, Redo, Interact, Close.
- `live/hand-edit-panel.tsx`: stop owning Pick; select mode driven by active tab and Interact.
- `chrome/shape-panel.tsx` (new): the shape property panel; `chrome/selection-pill.tsx`: remove shape/text controls.
- `live/code-editor.tsx` + `live/code-theme.ts` (new): theme and highlight style.
- `excalidraw-board.tsx`: panel visibility rule and wiring.
- Edit engine (`packages/screen-runtime/src/edit/`): add a property that is not written yet; add a `fontFamily` field with values Sans/Serif/Mono (Tailwind `font-sans|serif|mono` for class-based screens, inline `font-family` otherwise).

## Error handling

- If the frame cannot report computed values (old frame, blocked), fields fall back to showing what the code states, dimmed values show "—", and nothing crashes.
- An edit that cannot be applied (value is code logic, element gone) leaves the field unchanged and shows "That value is set by the screen's code. Change it in Code."
- Shape edits when a selection disappears mid-edit are ignored.

## Testing

- Unit: value mapping, wording, colour validation/palette, every control commits once, panel visibility rule, shape-panel scene updates, code theme token colours and contrast.
- Edit engine: adding unwritten properties (HTML inline style, JSX className, JSX style), font family writes, round trips.
- Browser (Playwright): click an element without pressing anything and the panel opens; deselect closes it; change font, weight and colour and see them applied; Interact lets a button work; draw a rectangle, fill it, see the fill; Undo/Redo in the header; Code view shows highlighted tokens.
- Visual: dark-theme screenshots of every state; Mac app check by the owner.
- Existing suites stay green; tests that assumed the Pick button or an always-open panel are updated deliberately.

## Risks

- **Selecting vs using a screen** is a real behaviour change; the Interact toggle is the escape hatch and must be obvious.
- **Computed values** across the frame boundary add messages; keep them small and bounded (strings capped, a fixed field set).
- **Adding unwritten properties** touches the edit engine that earlier work hardened; keep all existing round-trip tests.
