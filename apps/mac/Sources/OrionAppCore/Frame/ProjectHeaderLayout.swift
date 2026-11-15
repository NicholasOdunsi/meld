/// How the project header in the window toolbar shares the window's width:
/// project mark + name on the left, the three panel icons on the right, and
/// (when a side panel is open) a spacer after the icons as wide as the panel,
/// so the icons sit just before the panel's divider.
///
/// The toolbar must never ask for more width than the window has. When it
/// did (Canvas takes 72% of the window), AppKit squeezed the only item that
/// could shrink — the project name — down to nothing. So the spacer gives
/// way first, and the name always keeps at least `minimumNameWidth`.
public struct ProjectHeaderLayout: Equatable, Sendable {
    /// The name is never squeezed narrower than this; past it, it truncates with "…".
    public static let minimumNameWidth: Double = 80

    public var windowWidth: Double
    /// Where the project name text starts (after the traffic lights, the
    /// sidebar toggle, any sidebar, and the project mark).
    public var nameStart: Double
    /// Rough width of the three panel icons.
    public var iconsWidth: Double
    /// Breathing room between the name and the icons.
    public var nameSlack: Double
    /// Gap between the icons and the panel's divider.
    public var panelIconGap: Double
    /// Space the window toolbar leaves after its last item.
    public var trailingInset: Double

    public init(windowWidth: Double, nameStart: Double, iconsWidth: Double,
                nameSlack: Double, panelIconGap: Double, trailingInset: Double) {
        self.windowWidth = windowWidth
        self.nameStart = nameStart
        self.iconsWidth = iconsWidth
        self.nameSlack = nameSlack
        self.panelIconGap = panelIconGap
        self.trailingInset = trailingInset
    }

    /// Widest the spacer after the icons can be while the name keeps its minimum.
    private var spacerLimit: Double {
        windowWidth - trailingInset - iconsWidth - nameSlack - Self.minimumNameWidth - nameStart
    }

    /// Width of the spacer after the icons for a panel `panelWidth` wide
    /// (nil when no panel is open). Never negative; shrinks before the name does.
    public func spacerWidth(panelWidth: Double?) -> Double {
        guard let panelWidth, panelWidth.isFinite, windowWidth > 0 else { return 0 }
        let wanted = panelWidth + panelIconGap - trailingInset
        return max(0, min(wanted, spacerLimit))
    }

    /// Widest the project name may be. nil only before the window has a
    /// width; otherwise the room left of the icons, never below the minimum.
    public func nameMaxWidth(panelWidth: Double?) -> Double? {
        guard windowWidth > 0, windowWidth.isFinite else { return nil }
        let iconsStart = windowWidth - trailingInset - spacerWidth(panelWidth: panelWidth) - iconsWidth
        return max(Self.minimumNameWidth, iconsStart - nameSlack - nameStart)
    }
}
