"use client";

import { useEffect } from "react";

export type DeckShortcutsProps = {
  /** Opens the create-project dialog owned by `ProjectColumn`. */
  onNewProject: () => void;
};

/**
 * Keyboard bindings for the deck. Renders nothing.
 *
 * `⌘N` opens the create-project dialog rather than navigating: projects are
 * created by `CreateProjectDialog`, and there is no project route to push to.
 * `⇧⌘N` is deliberately unbound -- a "scratch room" does not exist yet, and a
 * shortcut that 404s is worse than no shortcut.
 */
export function DeckShortcuts({ onNewProject }: DeckShortcutsProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey) return;

      const key = event.key.toLowerCase();

      if (key === "k") {
        event.preventDefault();
        document.getElementById("deck-prompt")?.focus();
        return;
      }

      if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        onNewProject();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNewProject]);

  return null;
}
