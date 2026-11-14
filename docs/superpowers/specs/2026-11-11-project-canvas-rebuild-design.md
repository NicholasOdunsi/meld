> **Superseded 2026-11-14** by `2026-11-14-excalidraw-canvas-design.md`: the base is now Excalidraw, not a custom engine, and multiplayer is in scope.

# Project canvas rebuild

## Agreed direction

Keep the native Swift app interface and build a purpose-built web canvas without a tldraw runtime dependency. The canvas supports sketches, AI-generated live HTML frames, and direct editing of those frames. Start with one complete flow: sketch, generate HTML, edit, save, and reopen.

This first project validates the canvas replacement. Redesigning all project navigation, removing rooms from the product model, and rebuilding bot management are subsequent projects. Existing room identifiers may remain internal context during this milestone.

## Existing implementation

- `apps/mac/Sources/Orion/Frame/OrionFrameView.swift` owns the native window frame and sidebar.
- `apps/web/src/features/canvas/user-flow-trial-canvas.tsx` couples canvas interaction and synchronization to tldraw.
- `screen-preview-doc.ts` assembles existing generated HTML previews independently of tldraw.
- `screen-frame-overlay.tsx` displays sandboxed, noninteractive HTML previews.
- `use-canvas-selection.ts` translates selected sketches into generation context.
- `packages/prototype` already owns screen payloads, assembly, and sketch interpretation helpers.

Reuse screen generation and preview assembly where compatible. Preserve the isolation guarantees of existing previews.

## First milestone

Support freehand strokes, rectangles, text, reference images, and HTML frames. Users can pan, zoom, select, move, resize, delete, and undo or redo supported changes. Sketch selection supplies both a rendered image and structured geometry to the existing generation pipeline. A generated result appears as a live HTML frame and retains its editable source.

HTML editing initially supports selecting an element, changing plain text, and changing an allowlisted set of styles: color, background color, font size, padding, gap, and border radius. It does not promise arbitrary drag-and-drop restructuring of generated layouts. Preview interaction and element editing are explicit modes so canvas gestures do not compete with frame input.

## Architecture

### Canvas document and interaction

Use a versioned, renderer-independent document containing object IDs, world-coordinate bounds, stacking order, strokes, text, image references, and links to generated screen IDs. Keep HTML content in the screen model rather than duplicating it in canvas objects. Camera and selection are local view state; document changes pass through reversible commands.

Use a web scene with SVG for strokes, shapes, and selection decoration and positioned HTML frame hosts sharing the same world-to-screen transform. Keep camera math, hit testing, command history, serialization, and rendering separate. The proof of concept must establish acceptable interaction with a representative existing board before expanding scope. Do not add a native/web message for every pointer movement; Swift owns the surrounding app, while the web surface owns canvas interaction.

Use Astryx components and design tokens for application controls. Consult Astryx discovery and layout documentation before implementing UI. Geometry is document data and must be distinguished from UI styling.

### HTML editing bridge

Assign stable editable IDs to supported elements when preparing generated screens. Use an app-owned editing bridge inside an isolated preview to report selection and apply validated patches. Validate message source, frame session identity, message shape, element ID, and allowed operations at the host boundary. Generated content must never gain access to app credentials or privileged native commands.

The existing empty iframe sandbox cannot simply be made interactive without review. Determine the minimum sandbox permissions for the trusted editing bridge; do not enable same-origin access with script execution. Keep generated scripts disabled in the initial editing mode. Persist source changes and update the preview from saved source, rather than treating iframe DOM mutations as durable edits. Store source revisions so failed edits or regeneration can be recovered.

### AI integration

Adapt selected new-format objects to the existing sketch/generation contracts. Send selected context, reference assets, and the target screen revision. Create a new result revision rather than silently overwriting manual edits. If the source changes while generation is running, present the generated result separately for acceptance.

### Persistence and synchronization

Save versioned canvas documents independently of tldraw snapshots. Reuse existing screen persistence through an adapter. The first milestone supports one active editor per canvas, with explicit revision checks to reject stale saves. Unsaved or failed saves must be visible and retryable; preserve a local recovery copy. Real-time multiplayer is deferred and must be disclosed before replacing a shared editing workflow.

Database implementation and authorization design require a separate schema review before code changes. This design does not authorize dropping or overwriting existing records.

## Migration and rollout

Keep original snapshots and generated screen records intact. Build an importer for the tldraw record formats actually present in saved boards: supported strokes, shapes, text, images, frame positions, and screen links. Decode records as data without invoking the tldraw editor. Inventory flow nodes, connectors, assets, and unsupported records before enabling cutover. Preserve unsupported records in the migration archive and report them; do not silently discard them.

Use a feature flag for the replacement canvas. Demonstrate migration and reopening on representative boards before switching the default. Do not rely on an expired tldraw license for the rollout or fallback. Remove runtime dependencies only after auditing every production import and migrating affected routes; retain legacy snapshots for recovery.

## Errors and verification

Keep generation errors separate from canvas save errors. Failed generation leaves the original sketch and screen intact. Invalid HTML or unsupported edits display an actionable error without corrupting saved source.

Verify camera coordinate conversions, reversible document commands, serialization, revision conflict handling, and migration fidelity. Test the HTML bridge against malformed messages, wrong frame sources, and disallowed operations. Exercise the complete flow in the browser and Mac host: sketch, generate, edit text/style, undo, save, close, reopen. Check keyboard focus, trackpad zoom, frame input modes, and representative large-board performance. Validate that the replacement route loads without tldraw or its sync packages.

## Acceptance criteria

1. A user can complete the full sketch-to-editable-HTML flow and reopen the saved result.
2. Canvas interaction and rendering do not require tldraw.
3. Allowed HTML edits update durable source and survive regeneration of the preview.
4. Existing originals survive migration; unsupported content is reported.
5. Failed saves, stale revisions, and generation errors preserve recoverable work.
6. The first release clearly enforces its single-editor limitation.
