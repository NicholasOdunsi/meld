const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

// Shown for a react/html screen until it has been opened live once on this
// board (its picture is a snapshot of the running page). Static: thumbnails
// never run code. System colours only, so it reads in light and dark.
export function sleepingPlaceholder(name: string): string {
  return "<!doctype html><style>html,body{margin:0;height:100%}"
    + "body{display:grid;place-items:center;font-family:system-ui,sans-serif;color:GrayText;background:Canvas;text-align:center}</style>"
    + `<main><p><strong>${escapeHtml(name)}</strong></p><p>Double-click to open</p></main>`;
}

export function sleepingDocument(
  screen: { name: string; sourceKind?: "html" | "react" },
  legacy: () => string | null,
): string | null {
  return screen.sourceKind ? sleepingPlaceholder(screen.name) : legacy();
}
