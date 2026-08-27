import { MeldKeycap } from "@/ui/meld/keycap";
import { MeldLabel, MeldStartActions } from "@/ui/meld/stack";

/**
 * Only the shortcuts that actually exist. `⇧⌘N` ("scratch room") is
 * deliberately absent -- there is no scratch-room concept in this app, and a
 * shortcut that 404s is worse than no shortcut. See `DeckShortcuts`.
 */
const SHORTCUTS = [
  { keys: "⌘N", label: "New project" },
  { keys: "⌘K", label: "Ask anything" },
] as const;

export function ShortcutLine() {
  return (
    <MeldStartActions>
      {SHORTCUTS.map((shortcut) => (
        <MeldStartActions key={shortcut.keys}>
          <MeldKeycap>{shortcut.keys}</MeldKeycap>
          <MeldLabel>{shortcut.label}</MeldLabel>
        </MeldStartActions>
      ))}
    </MeldStartActions>
  );
}
