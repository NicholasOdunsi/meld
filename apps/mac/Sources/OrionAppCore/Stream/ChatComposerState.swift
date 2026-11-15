import Foundation

/// The chat composer's resting-versus-open decision and its text-area size
/// limits, kept apart from the view so they can be tested.
///
/// The composer rests as a one-line bar and opens into the full composer when
/// the person focuses it or has something drafted. Only its height changes,
/// never its width.
public enum ChatComposerState {
    /// Whether the composer should be open (full size) rather than resting.
    ///
    /// Open while it has focus, while anything is drafted (words or staged
    /// files), or while the person is using one of its controls (the file
    /// picker) that can pull focus away from the text.
    public static func isExpanded(
        draft: String,
        hasAttachments: Bool,
        isFocused: Bool,
        isInteracting: Bool = false
    ) -> Bool {
        isFocused
            || isInteracting
            || hasAttachments
            || !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// How many lines the open text area shows: it starts at the minimum and
    /// grows with the text up to the maximum, then scrolls. A Star's narrower
    /// panel gets a lower ceiling.
    public static func lineLimits(isStarThread: Bool) -> ClosedRange<Int> {
        isStarThread ? 2...6 : 2...8
    }

    /// The number of lines to show for text that needs `contentLines`.
    public static func visibleLines(forContentLines contentLines: Int, isStarThread: Bool) -> Int {
        let limits = lineLimits(isStarThread: isStarThread)
        return min(max(contentLines, limits.lowerBound), limits.upperBound)
    }

    /// The hint shown in the empty text field and on the resting bar.
    public static func placeholder(isStarThread: Bool) -> String {
        isStarThread ? "Reply to Orion…" : "Ask Orion for something…"
    }
}
