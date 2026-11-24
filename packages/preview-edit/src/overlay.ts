import { resolveAnySource } from "./resolve-source";
import { captureNextJsxSource } from "./next-jsx-source";
import { canEditText, changedSize, describeElement, isPickable, type HandleKind, type Size } from "./overlay-core";

// One colour for the outline and handles inside the third-party preview page, where Orion's tokens do not exist.
const HIGHLIGHT = "#4c8dff";
const HANDLE = 8;

// Injected by CanvasLivePreview in the closure that owns the authenticated native channel.
declare const orionPostPreviewMessage: (message: unknown) => void;
const post = (message: unknown) => orionPostPreviewMessage(message);
const nextJsxSource = captureNextJsxSource(window);

let enabled = false;
let textEditable = false;
let resizable = false;
let selected: Element | null = null;
let elementId = 0;
let pickRevision = 0;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let hovered: Element | null = null;
// Set while a double-click text edit is in progress; calling it ends the edit (true keeps the typed text).
let endEdit: ((commit: boolean) => void) | null = null;
let endResize: ((commit: boolean) => void) | null = null;

const OVERLAY_IDS = ["orion-selected", "orion-hover", "orion-handle-right", "orion-handle-bottom", "orion-handle-corner"];

// The overlay's visible nodes exist only while edit mode is on.
function box(id: string): HTMLDivElement | null {
  let element = document.getElementById(id) as HTMLDivElement | null;
  if (!element && enabled) {
    element = document.createElement("div");
    element.id = id;
    Object.assign(element.style, { position: "fixed", pointerEvents: "none", zIndex: "2147483646", boxSizing: "border-box" });
    document.documentElement.appendChild(element);
  }
  return element;
}

function removeNodes() {
  for (const id of OVERLAY_IDS) document.getElementById(id)?.remove();
  for (const kind of Object.keys(handles) as HandleKind[]) delete handles[kind];
}

function outline(id: string, target: Element | null, solid: boolean) {
  if (!enabled) return;
  const element = target ? box(id) : document.getElementById(id);
  if (!element) return;
  if (!target) { element.style.display = "none"; return; }
  const rect = target.getBoundingClientRect();
  Object.assign(element.style, {
    display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    border: `${solid ? 2 : 1}px ${solid ? "solid" : "dashed"} ${HIGHLIGHT}`,
  });
}

const handles: Partial<Record<HandleKind, HTMLDivElement>> = {};
function drawHandles() {
  if (!enabled) return;
  const rect = selected && resizable ? selected.getBoundingClientRect() : null;
  for (const kind of ["right", "bottom", "corner"] as const) {
    let handle = handles[kind];
    if (!rect) { if (handle) handle.style.display = "none"; continue; }
    if (!handle) {
      const created = box(`orion-handle-${kind}`);
      if (!created) continue;
      Object.assign(created.style, { pointerEvents: "auto", background: HIGHLIGHT, width: `${HANDLE}px`, height: `${HANDLE}px`, cursor: kind === "right" ? "ew-resize" : kind === "bottom" ? "ns-resize" : "nwse-resize" });
      created.addEventListener("pointerdown", (event) => startResize(event, kind, created));
      handle = handles[kind] = created;
    }
    handle.style.display = "block";
    handle.style.left = `${kind === "bottom" ? rect.left + rect.width / 2 - HANDLE / 2 : rect.right - HANDLE / 2}px`;
    handle.style.top = `${kind === "right" ? rect.top + rect.height / 2 - HANDLE / 2 : rect.bottom - HANDLE / 2}px`;
  }
}

// Releasing a handle after a drag still produces a click, possibly on a different element: swallow it.
function swallowNextClick() {
  const swallow = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
  window.addEventListener("click", swallow, true);
  setTimeout(() => window.removeEventListener("click", swallow, true), 100);
}

function startResize(event: PointerEvent, kind: HandleKind, handle: HTMLElement) {
  if (!event.isTrusted || !enabled || !resizable || !selected || endResize) return;
  event.preventDefault();
  event.stopPropagation();
  const target = selected as HTMLElement;
  const start = target.getBoundingClientRect();
  const startSize: Size = { width: Math.round(start.width), height: Math.round(start.height) };
  const size: Size = { ...startSize };
  const originalWidth = target.style.width;
  const originalHeight = target.style.height;
  try { handle.setPointerCapture(event.pointerId); } catch { /* The pointer may have ended. */ }
  const move = (next: PointerEvent) => {
    if (!next.isTrusted || next.pointerId !== event.pointerId || !enabled || target !== selected) return;
    if (kind !== "bottom") { size.width = Math.max(8, Math.round(start.width + next.clientX - event.clientX)); target.style.width = `${size.width}px`; }
    if (kind !== "right") { size.height = Math.max(8, Math.round(start.height + next.clientY - event.clientY)); target.style.height = `${size.height}px`; }
    drawHandles(); outline("orion-selected", target, true);
  };
  const finish = (commit: boolean) => {
    endResize = null;
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    // The live drag was only a preview; the code edit (then hot reload) decides the final style.
    target.style.width = originalWidth; target.style.height = originalHeight;
    if (!commit || !enabled || !resizable || target !== selected) return;
    swallowNextClick();
    const changed = changedSize(kind, startSize, size);
    if (changed) post({ type: "resized", ...changed });
  };
  const up = (next: PointerEvent) => {
    if (next.isTrusted && next.pointerId === event.pointerId) finish(true);
  };
  const cancel = (next: PointerEvent) => {
    if (next.isTrusted && next.pointerId === event.pointerId) finish(false);
  };
  endResize = finish;
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
}

async function pick(target: Element) {
  // A new target must wait for Swift to inspect its editable fields.
  if (selected !== target) {
    endResize?.(false);
    textEditable = false;
    resizable = false;
    elementId += 1;
    post({ type: "cleared" });
  }
  const revision = ++pickRevision;
  selected = target;
  outline("orion-selected", target, true);
  drawHandles();
  const src = nextJsxSource(target) ?? await resolveAnySource(target);
  if (revision !== pickRevision || selected !== target) return;
  post({ type: "picked", elementId, src, ...describeElement(target, window) });
}

function clear() {
  clearTimeout(refreshTimer);
  endEdit?.(false);
  endResize?.(false);
  selected = null; hovered = null;
  outline("orion-selected", null, true); outline("orion-hover", null, false); drawHandles();
  post({ type: "cleared" });
}

function underPointer(event: MouseEvent): Element | null {
  const target = document.elementFromPoint(event.clientX, event.clientY);
  return target && isPickable(target) && !target.id?.startsWith("orion-") ? target : null;
}

document.addEventListener("pointermove", (event) => {
  if (!enabled) return;
  hovered = underPointer(event);
  outline("orion-hover", hovered && hovered !== selected ? hovered : null, false);
}, true);

document.addEventListener("click", (event) => {
  if (!enabled || !event.isTrusted) return;
  // A click on the overlay's own handles must not reach the page.
  if (document.elementFromPoint(event.clientX, event.clientY)?.id?.startsWith("orion-")) {
    event.preventDefault(); event.stopPropagation();
    return;
  }
  const target = underPointer(event);
  if (!target) return;
  event.preventDefault(); event.stopPropagation();
  if (target !== selected) void pick(target);
}, true);

document.addEventListener("dblclick", (event) => {
  if (!event.isTrusted || !enabled || endEdit || !(selected instanceof HTMLElement) || !textEditable
      || underPointer(event) !== selected || !canEditText(selected)) return;
  event.preventDefault(); event.stopPropagation();
  const target = selected;
  const original = target.textContent ?? "";
  const originalEditable = target.getAttribute("contenteditable");
  let edited = false;
  target.contentEditable = "plaintext-only";
  target.focus();
  const finish = (commit: boolean) => {
    if (endEdit !== finish) return;
    endEdit = null;
    target.removeEventListener("blur", onBlur);
    target.removeEventListener("input", onInput);
    target.removeEventListener("keydown", onKey);
    if (originalEditable === null) target.removeAttribute("contenteditable");
    else target.setAttribute("contenteditable", originalEditable);
    const text = target.textContent ?? "";
    if (commit && edited && text !== original) post({ type: "retyped", text });
    else if (text !== original) target.textContent = original;
  };
  const onBlur = (event: FocusEvent) => { if (event.isTrusted) finish(true); };
  const onInput = (event: Event) => { if (event.isTrusted) edited = true; };
  const onKey = (key: KeyboardEvent) => {
    if (!key.isTrusted) return;
    if (key.key === "Enter") { key.preventDefault(); finish(true); }
    else if (key.key === "Escape") { key.preventDefault(); key.stopPropagation(); finish(false); }
  };
  endEdit = finish;
  target.addEventListener("blur", onBlur);
  target.addEventListener("input", onInput);
  target.addEventListener("keydown", onKey);
}, true);

// While text is being edited, Escape only cancels the edit; it does not drop the selection.
document.addEventListener("keydown", (event) => {
  if (event.isTrusted && enabled && !endEdit && event.key === "Escape" && selected) clear();
}, true);

// Keep the outline on the selected node during hot reload. Replacing the node invalidates the pick.
const observer = new MutationObserver((changes) => {
  if (!enabled || !selected) return;
  if (changes.every(({ target }) => target instanceof HTMLElement && OVERLAY_IDS.includes(target.id))) return;
  if (!selected.isConnected) { clear(); return; }
  const target = selected;
  outline("orion-selected", target, true);
  drawHandles();
  if (endEdit || endResize || !changes.some(({ target: changed }) => target.contains(changed))) return;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (enabled && selected === target && !endEdit && !endResize) void pick(target);
  }, 100);
});
const observe = () => observer.observe(document.documentElement, {
  childList: true, subtree: true, characterData: true, attributeFilter: ["style", "class"],
});
if (document.documentElement) observe();
else document.addEventListener("DOMContentLoaded", observe, { once: true });
window.addEventListener("scroll", () => { if (!enabled) return; drawHandles(); outline("orion-selected", selected, true); }, true);

(window as unknown as { __orionPreviewEdit: unknown }).__orionPreviewEdit = {
  setEnabled(on: boolean) {
    if (on === enabled) return;
    if (on) { enabled = true; return; }
    clear();
    enabled = false;
    removeNodes();
  },
  setSelectionInfo(info: { textEditable: boolean; resizable: boolean }) {
    textEditable = info.textEditable;
    resizable = info.resizable;
    if (!textEditable) endEdit?.(false);
    if (!resizable) endResize?.(false);
    drawHandles();
  },
  reselect() { if (selected) void pick(selected); },
};
