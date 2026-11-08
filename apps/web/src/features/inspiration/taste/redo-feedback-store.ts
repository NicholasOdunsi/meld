"use client";

import { useSyncExternalStore } from "react";

export const REDO_FEEDBACK_TIMEOUT_MS = 20_000;

type State = { screenId: string } | null;
let state: State = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

/** Shows "What was off?" for this screen; replaces any earlier request. */
export function requestRedoFeedback(screenId: string): void {
  if (timer) clearTimeout(timer);
  set({ screenId });
  timer = setTimeout(() => set(null), REDO_FEEDBACK_TIMEOUT_MS);
}

export function dismissRedoFeedback(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  set(null);
}

export function useRedoFeedback(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => null,
  );
}
