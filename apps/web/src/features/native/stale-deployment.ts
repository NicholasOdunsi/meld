// An open Orion window keeps the page it loaded. After a deploy the server
// forgets that page's server calls, so sends and loads fail until the page is
// reloaded. These helpers decide when reloading is the right (and safe) move.

const STALE_ERROR = /Failed to find Server Action|unexpected response was received from the server/i;

export function isStaleDeploymentError(reason: unknown): boolean {
  const text = reason instanceof Error ? reason.message : typeof reason === "string" ? reason : "";
  return STALE_ERROR.test(text);
}

// Someone mid-sentence must never lose their words to a reload.
export function isUserTyping(doc: Pick<Document, "activeElement">): boolean {
  const el = doc.activeElement as (HTMLElement & { value?: string }) | null;
  if (!el) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.trim().length > 0;
  return el.isContentEditable === true && (el.textContent ?? "").trim().length > 0;
}

export const MIN_RELOAD_GAP_MS = 60_000;

// A page that is still stale after reloading must not loop.
export function reloadAllowed(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt >= MIN_RELOAD_GAP_MS;
}
