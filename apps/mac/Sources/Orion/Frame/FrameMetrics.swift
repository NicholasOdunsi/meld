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

    // MARK: Overview page

    /// Side/bottom inset for Overview content. Top is tighter so the quote
    /// card lines up with the Overview sidebar row.
    static let overviewMargin: Double = 64
    static let overviewTopMargin: Double = 8
    static let overviewMaxWidth: Double = 720
    static let overviewSectionGap: Double = 24
    /// Full-bleed painting card with the quote drawn on the image.
    static let overviewHeroHeight: Double = 220
    static let overviewHeroRadius: Double = 20
    static let overviewCardInset: Double = 18
    static let overviewQuoteSize: Double = 22
    /// Hat header: the big hat beside the greeting, over a faded painting.
    static let overviewHatSize: Double = 112
    static let overviewHatSpacing: Double = 20
    /// Extra room between the hat header and the Todo list.
    static let overviewHeaderBottomGap: Double = 28
    static let overviewWashHeight: Double = 340
    static let overviewWashOpacity: Double = 0.22
    /// Keeps the hat's sentence to a comfortable line length.
    static let overviewSummaryMaxWidth: Double = 460
    /// Fixed project chip width so selecting a project doesn't reflow the row.
    static let overviewProjectChipWidth: Double = 148
}
