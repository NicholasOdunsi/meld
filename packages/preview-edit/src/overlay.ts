import { resolveAnySource } from "./resolve-source";
import { describeElement, elementAt, isPickable, pathTo } from "./overlay-core";

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

function box(id: string): HTMLDivElement {
  let element = document.getElementById(id) as HTMLDivElement | null;
  if (!element) {
    element = document.createElement("div");
    element.id = id;
    Object.assign(element.style, { position: "fixed", pointerEvents: "none", zIndex: "2147483646", boxSizing: "border-box" });
    document.documentElement.appendChild(element);
  }
  return element;
}

function outline(id: string, target: Element | null, solid: boolean) {
  const element = box(id);
  if (!target || !enabled) { element.style.display = "none"; return; }
  const rect = target.getBoundingClientRect();
  Object.assign(element.style, {
    display: "block", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`,
    border: `${solid ? 2 : 1}px ${solid ? "solid" : "dashed"} ${HIGHLIGHT}`,
  });
}

const handles: Record<"right" | "bottom" | "corner", HTMLDivElement> = {} as never;
function drawHandles() {
  const rect = selected && enabled ? selected.getBoundingClientRect() : null;
  for (const kind of ["right", "bottom", "corner"] as const) {
    const handle = (handles[kind] ??= (() => {
      const element = box(`orion-handle-${kind}`);
      Object.assign(element.style, { pointerEvents: "auto", background: HIGHLIGHT, width: `${HANDLE}px`, height: `${HANDLE}px`, cursor: kind === "right" ? "ew-resize" : kind === "bottom" ? "ns-resize" : "nwse-resize" });
      element.addEventListener("pointerdown", (event) => startResize(event, kind));
      return element;
    })());
    if (!rect) { handle.style.display = "none"; continue; }
    handle.style.display = "block";
    handle.style.left = `${kind === "bottom" ? rect.left + rect.width / 2 - HANDLE / 2 : rect.right - HANDLE / 2}px`;
    handle.style.top = `${kind === "right" ? rect.top + rect.height / 2 - HANDLE / 2 : rect.bottom - HANDLE / 2}px`;
  }
}

function startResize(event: PointerEvent, kind: "right" | "bottom" | "corner") {
  if (!selected) return;
  event.preventDefault();
  event.stopPropagation();
  const target = selected as HTMLElement;
  const start = target.getBoundingClientRect();
  const originalWidth = target.style.width;
  const originalHeight = target.style.height;
  let width = Math.round(start.width);
  let height = Math.round(start.height);
  const move = (next: PointerEvent) => {
    if (kind !== "bottom") { width = Math.max(8, Math.round(start.width + next.clientX - event.clientX)); target.style.width = `${width}px`; }
    if (kind !== "right") { height = Math.max(8, Math.round(start.height + next.clientY - event.clientY)); target.style.height = `${height}px`; }
    drawHandles(); outline("orion-selected", target, true);
  };
  const up = () => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    // The live drag was only a preview; the code edit (then hot reload) decides the final style.
    target.style.width = originalWidth; target.style.height = originalHeight;
    post({ type: "resized", ...(kind !== "bottom" ? { width } : {}), ...(kind !== "right" ? { height } : {}) });
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
}

async function pick(target: Element) {
  selected = target;
  selectedPath = pathTo(target, document.documentElement);
  outline("orion-selected", target, true);
  drawHandles();
  const src = await resolveAnySource(target);
  if (selected !== target) return;
  post({ type: "picked", src, ...describeElement(target, window) });
}

function clear() {
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
  const target = underPointer(event);
  if (!target) return;
  event.preventDefault(); event.stopPropagation();
  void pick(target);
}, true);

document.addEventListener("dblclick", (event) => {
  if (!enabled || !selected || !textEditable || underPointer(event) !== selected) return;
  event.preventDefault(); event.stopPropagation();
  const target = selected as HTMLElement;
  target.contentEditable = "plaintext-only";
  target.focus();
  const finish = (commit: boolean) => {
    target.removeEventListener("blur", onBlur); target.removeEventListener("keydown", onKey);
    target.removeAttribute("contenteditable");
    if (commit) post({ type: "retyped", text: target.textContent ?? "" });
  };
  const onBlur = () => finish(true);
  const onKey = (key: KeyboardEvent) => {
    if (key.key === "Enter") { key.preventDefault(); finish(true); } else if (key.key === "Escape") { finish(false); }
  };
  target.addEventListener("blur", onBlur); target.addEventListener("keydown", onKey);
}, true);

document.addEventListener("keydown", (event) => { if (enabled && event.key === "Escape" && selected) clear(); }, true);

// A hot reload replaces nodes: find the selection again by its position in the page and report fresh values.
new MutationObserver(() => {
  if (!enabled || !selectedPath.length) return;
  const again = elementAt(document.documentElement, selectedPath);
  if (again && again !== selected && isPickable(again)) void pick(again);
  else if (selected) { outline("orion-selected", selected, true); drawHandles(); }
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("scroll", () => { drawHandles(); outline("orion-selected", selected, true); }, true);

(window as unknown as { __orionPreviewEdit: unknown }).__orionPreviewEdit = {
  setEnabled(on: boolean) { enabled = on; if (!on) clear(); },
  setSelectionInfo(info: { textEditable: boolean }) { textEditable = info.textEditable; },
  reselect() { if (selected) void pick(selected); },
};
