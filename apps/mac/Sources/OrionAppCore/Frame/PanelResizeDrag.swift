/// One drag of the side panel's left edge, as plain state so it can be tested.
///
/// - Each drag starts from the width shown when *that* drag began. A drag is
///   recognised by where it started, so a start left over from an earlier drag
///   that never reported its end (SwiftUI skips `onEnded` when a gesture is
///   cancelled) can't be reused and make the panel jump.
/// - Until the pointer has moved `clickSlop` points the drag is a click and
///   changes nothing.
/// - While dragging, `liveWidth` is what to draw; only `end()` hands back a
///   width to save, so a drag is saved once, when it finishes.
public struct PanelResizeDrag: Equatable, Sendable {
    /// Pointer travel below this is a click, not a resize.
    public static let clickSlop: Double = 3

    private var startLocationX: Double?
    private var startWidth: Double = 0
    /// The width to draw while dragging; nil before the drag passes `clickSlop`.
    public private(set) var liveWidth: Double?

    public init() {}

    /// Whether a drag (or a click that may still become one) is under way.
    public var isActive: Bool { startLocationX != nil }

    /// A pointer move. `startLocationX` is where this gesture began (it is the
    /// same for every move of one drag); `translation` is how far the pointer
    /// has moved horizontally since then; `shownWidth` is the panel's width on
    /// screen right now, used only when a new drag begins.
    /// Returns the width to draw, or nil while this is still a click.
    @discardableResult
    public mutating func change(startLocationX: Double, translation: Double,
                                shownWidth: Double, detailWidth: Double) -> Double? {
        if self.startLocationX != startLocationX {
            self.startLocationX = startLocationX
            startWidth = shownWidth
            liveWidth = nil
        }
        guard liveWidth != nil || abs(translation) >= Self.clickSlop else { return nil }
        // The panel is on the right: dragging left makes it wider. Kept as
        // shown, so there's no dead zone past the limit when dragging back.
        let width = DetailSplit(detailWidth: detailWidth,
                                panel: .side(preferredWidth: startWidth - translation)).panelWidth
        liveWidth = width
        return width
    }

    /// The drag finished (or was cancelled). Returns the width to save, or
    /// nil if it was only a click. Safe to call more than once.
    public mutating func end() -> Double? {
        defer { self = Self() }
        return liveWidth.map(PanelWidth.clampStored)
    }
}
