# Independent canvas prototype

Open `/dev/canvas-next` on the web development server. This route returns not found in a production build. It does not replace the current project canvas or load its tldraw gateway.

For a standalone preview without database credentials:

```sh
MELD_E2E_FAKE_WORKSPACES=true MELD_E2E_DIST_DIR=.next-canvas-next pnpm --filter @meld/web exec next dev --hostname 127.0.0.1 --port 3017
```

Then visit `http://127.0.0.1:3017/dev/canvas-next`. The existing fake-workspaces development gate bypasses session refresh; it cannot activate in production.

Select tools in the toolbar. Use Space-drag or the Pan tool to move the view, modifier-scroll to zoom around the pointer, Shift-click to select several objects, and the lower-right selection handle to resize. Double-click a note to edit it; Enter or a canvas click commits the text, Escape cancels it. Delete removes selected objects. Use Undo/Redo or the platform keyboard shortcuts.

Export canvas downloads version 1 JSON; Import canvas opens it as one undoable change. Changes are local and disappear on reload unless exported. Images resolve only from the application-owned asset map; HTML frames reference fixture screen records. Importing unknown image or screen references displays a placeholder. The document file does not bundle assets or HTML source. HTML previews are read-only and sandboxed without script execution.

Run focused verification:

```sh
pnpm --filter @meld/web exec vitest run src/features/canvas-next
pnpm exec playwright test --config playwright.canvas-next.config.ts
```

The browser suite has its own build directory and does not need the sync gateway or database services. It checks file round-trip, editing gestures, pointer anchoring, sandbox isolation, runtime dependency independence, and 30 seconds of pan/zoom with 1,000 rectangle objects. This is not a benchmark of many live HTML frames.

AI integration, direct HTML editing, server saving, native-host gesture verification, migration, and production cutover belong to the subsequent stages in the approved design.
