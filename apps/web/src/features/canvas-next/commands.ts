import type { CanvasDocument } from "./document";
export type History = { past: CanvasDocument[]; present: CanvasDocument; future: CanvasDocument[] };
export function createHistory(document: CanvasDocument): History {
  return { past: [], present: document, future: [] };
}
export function replaceDocument(history: History, document: CanvasDocument): History {
  if (JSON.stringify(history.present) === JSON.stringify(document)) return history;
  return { past: [...history.past, history.present].slice(-100), present: document, future: [] };
}
export function undo(history: History): History {
  if (!history.past.length) return history;
  return { past: history.past.slice(0, -1), present: history.past.at(-1)!, future: [history.present, ...history.future] };
}
export function redo(history: History): History {
  if (!history.future.length) return history;
  return { past: [...history.past, history.present].slice(-100), present: history.future[0], future: history.future.slice(1) };
}
