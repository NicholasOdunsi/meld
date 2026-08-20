import { MeldTextInput } from "@/ui/meld/text-input";

export type DeckPromptProps = {
  /**
   * Visible placeholder copy. The accessible name comes from the field's
   * (visually hidden) label, not this text -- see `MeldTextInput`'s "no
   * placeholder-as-label" rule.
   */
  placeholder?: string;
};

const DEFAULT_PLACEHOLDER = "Ask anything, or type a command…";

/**
 * The prompt at the bottom of the deck. Renders, is labelled, and is
 * focusable by `⌘K` (see `DeckShortcuts`) -- nothing more. Where a typed
 * command routes is a separate piece of work with its own spec.
 */
export function DeckPrompt({
  placeholder = DEFAULT_PLACEHOLDER,
}: DeckPromptProps) {
  return (
    <MeldTextInput
      id="deck-prompt"
      label="What are we doing today?"
      hideLabel
      placeholder={placeholder}
    />
  );
}
