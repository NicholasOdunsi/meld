import Foundation

/// The chat composer's resting-versus-open decision and its text-area size
/// limits, kept apart from the view so they can be tested.
///
/// The composer rests as a one-line bar and opens into the full composer when
/// the person clicks it or has something drafted. Only its height changes,
/// never its width.
public enum ChatComposerState {
    /// Whether the composer should be open (full size) rather than resting.
    ///
    /// Open when the person opened it (clicked the resting bar), while anything
    /// is drafted (words or staged files), or while one of its controls (the
    /// file picker) is in use. Focus alone never opens it: AppKit can give a
    /// text field focus by itself at launch or on a project switch, and the
    /// composer must stay a resting bar until the person asks for it.
    public static func isExpanded(
        draft: String,
        hasAttachments: Bool,
        isUserOpened: Bool,
        isFocused: Bool = false,
        isInteracting: Bool = false
    ) -> Bool {
        _ = isFocused // deliberately ignored, see above
        return isUserOpened
            || isInteracting
            || hasAttachments
            || !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Whether the hint text shows: for as long as nothing has been typed,
    /// whether or not the composer is open or focused.
    public static func showsPlaceholder(draft: String) -> Bool {
        draft.isEmpty
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
