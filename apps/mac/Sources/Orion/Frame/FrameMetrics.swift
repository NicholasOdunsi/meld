import Foundation

/// One set of measurements for the whole frame, so everything shares the
/// same rhythm: one left edge, one row height, one corner shape.
enum FrameMetrics {
    /// Gap between the sidebar edge and a row's highlight.
    static let sidebarInset: Double = 8
    /// Gap between a row's highlight and its icon. Together with
    /// `sidebarInset` this is the single left edge (16pt) that icons and
    /// section labels all start on.
    static let rowPadding: Double = 8
    static var contentEdge: Double { sidebarInset + rowPadding }
    /// Every row, tab and small button is this tall…
    static let rowHeight: Double = 28
    /// …with these corners: rounded rectangles everywhere, no circles.
    static let cornerRadius: Double = 7
    static let iconTextSpacing: Double = 8
    static let rowSpacing: Double = 2
    /// Project rows use slightly taller marks, so they need a touch more air.
    static let projectRowSpacing: Double = 6
    /// Space between groups in the sidebar.
    static let groupSpacing: Double = 16
    /// "Projects" section label — a touch under body so it sits with the
    /// rows above without shouting.
    static let sectionLabelSize: Double = 12
    /// Gap under the section label before the first project row.
    static let sectionLabelBottom: Double = 6
    /// Extra space between the traffic lights and the toolbar sidebar toggle.
    static let toolbarToggleLeading: Double = 0
    /// Faint rule between the sidebar and the detail column.
    static let columnDividerWidth: Double = 1
    static let columnDividerOpacity: Double = 0.14
}
