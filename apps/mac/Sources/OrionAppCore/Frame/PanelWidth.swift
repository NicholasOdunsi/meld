/// How wide the right-hand To-do / Constellations / Star panel may be.
/// The person drags the panel's left edge; this keeps the result in range.
public enum PanelWidth {
    public static let minimum: Double = 280
    public static let absoluteMaximum: Double = 640
    /// The panel never takes more than this share of the width it sits in,
    /// so the chat beside it always has room.
    public static let maximumFraction: Double = 0.55
    public static let `default`: Double = 360

    /// The widest the panel may be in an area `windowWidth` wide: the smaller
    /// of the absolute cap and the fraction cap, but never below the minimum.
    public static func maximum(windowWidth: Double) -> Double {
        max(minimum, min(absoluteMaximum, windowWidth * maximumFraction))
    }

    /// `proposed` pulled into the allowed range for this window width.
    public static func clamp(_ proposed: Double, windowWidth: Double) -> Double {
        min(max(proposed, minimum), maximum(windowWidth: windowWidth))
    }
}
