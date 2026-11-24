import { resolveAnySource } from "./resolve-source";
import { canEditText, changedSize, describeElement, elementAt, isPickable, pathTo, type HandleKind, type Size } from "./overlay-core";

// One colour for the outline and handles inside the third-party preview page, where Orion's tokens do not exist.
const HIGHLIGHT = "#4c8dff";
const HANDLE = 8;

type Native = { postMessage(message: unknown): void };
const native = (): Native | undefined =>
  (window as unknown as { webkit?: { messageHandlers?: { orionPreview?: Native } } }).webkit?.messageHandlers?.orionPreview;
const post = (message: unknown) => native()?.postMessage(message);

let enabled = false;
let textEditable = false;
let selected: Element | null = null;
let selectedPath: number[] = [];
let hovered: Element | null = null;
// Set while a double-click text edit is in progress; calling it ends the edit (true keeps the typed text).
let endEdit: ((commit: boolean) => void) | null = null;

const OVERLAY_IDS = ["orion-selected", "orion-hover", "orion-handle-right", "orion-handle-bottom", "orion-handle-corner"];

// The overlay's own nodes exist only while the feature is on, so a page where it is off is never touched.
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
  const rect = selected ? selected.getBoundingClientRect() : null;
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
  if (!selected) return;
  event.preventDefault();
  event.stopPropagation();
  const target = selected as HTMLElement;
  const start = target.getBoundingClientRect();
  const startSize: Size = { width: Math.round(start.width), height: Math.round(start.height) };
  const size: Size = { ...startSize };
  const originalWidth = target.style.width;
  const originalHeight = target.style.height;
  try { handle.setPointerCapture(event.pointerId); } catch { /* synthetic pointers cannot be captured */ }
  const move = (next: PointerEvent) => {
    if (kind !== "bottom") { size.width = Math.max(8, Math.round(start.width + next.clientX - event.clientX)); target.style.width = `${size.width}px`; }
    if (kind !== "right") { size.height = Math.max(8, Math.round(start.height + next.clientY - event.clientY)); target.style.height = `${size.height}px`; }
    drawHandles(); outline("orion-selected", target, true);
  };
  const finish = (commit: boolean) => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", cancel, true);
    // The live drag was only a preview; the code edit (then hot reload) decides the final style.
    target.style.width = originalWidth; target.style.height = originalHeight;
    if (!commit) return;
    swallowNextClick();
    const changed = changedSize(kind, startSize, size);
    if (changed) post({ type: "resized", ...changed });
  };
  const up = () => finish(true);
  const cancel = () => finish(false);
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", cancel, true);
}

async function pick(target: Element) {
  // A different element: editing text is allowed only after Swift reports its flag (setSelectionInfo).
  // Re-picking the same element (the clicks of a double-click) keeps the flag Swift already gave.
  if (selected !== target) textEditable = false;
  selected = target;
  selectedPath = pathTo(target, document.documentElement);
  outline("orion-selected", target, true);
  drawHandles();
  const src = await resolveAnySource(target);
  if (selected !== target) return;
  post({ type: "picked", src, ...describeElement(target, window) });
}

function clear() {
  endEdit?.(false);
  selected = null; hovered = null; selectedPath = [];
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
  if (!enabled) return;
  // A click on the overlay's own handles must not reach the page.
  if (document.elementFromPoint(event.clientX, event.clientY)?.id?.startsWith("orion-")) {
    event.preventDefault(); event.stopPropagation();
    return;
  }
  const target = underPointer(event);
  if (!target) return;
  event.preventDefault(); event.stopPropagation();
  void pick(target);
}, true);

document.addEventListener("dblclick", (event) => {
  if (!enabled || endEdit || !selected || !textEditable || underPointer(event) !== selected || !canEditText(selected)) return;
  event.preventDefault(); event.stopPropagation();
  const target = selected as HTMLElement;
  const original = target.textContent ?? "";
  target.contentEditable = "plaintext-only";
  target.focus();
  const finish = (commit: boolean) => {
    if (endEdit !== finish) return;
    endEdit = null;
    target.removeEventListener("blur", onBlur); target.removeEventListener("keydown", onKey);
    target.removeAttribute("contenteditable");
    if (commit) post({ type: "retyped", text: target.textContent ?? "" });
    else target.textContent = original;
  };
  const onBlur = () => finish(true);
  const onKey = (key: KeyboardEvent) => {
    if (key.key === "Enter") { key.preventDefault(); finish(true); }
    else if (key.key === "Escape") { key.preventDefault(); key.stopPropagation(); finish(false); }
  };
  endEdit = finish;
  target.addEventListener("blur", onBlur); target.addEventListener("keydown", onKey);
}, true);

// While text is being edited, Escape only cancels the edit; it does not drop the selection.
document.addEventListener("keydown", (event) => { if (enabled && !endEdit && event.key === "Escape" && selected) clear(); }, true);

// A hot reload replaces nodes: find the selection again by its position in the page and report fresh values.
new MutationObserver(() => {
  if (!enabled || !selectedPath.length) return;
  const again = elementAt(document.documentElement, selectedPath);
  if (again && again !== selected && isPickable(again)) void pick(again);
  else if (selected) { outline("orion-selected", selected, true); drawHandles(); }
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("scroll", () => { if (!enabled) return; drawHandles(); outline("orion-selected", selected, true); }, true);

(window as unknown as { __orionPreviewEdit: unknown }).__orionPreviewEdit = {
  setEnabled(on: boolean) {
    if (on) { enabled = true; return; }
    clear();
    enabled = false;
    removeNodes();
  },
  setSelectionInfo(info: { textEditable: boolean }) { textEditable = info.textEditable; },
  reselect() { if (selected) void pick(selected); },
};
