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
    /// Gap between the three panel icons and the side panel's divider.
    static let panelIconGap: Double = 12
    /// Space the window toolbar leaves after its last item.
    static let toolbarTrailingInset: Double = 12
    /// Header panel icons (To-do, Canvas, Artifacts): hit area, glyph size
    /// and gap. About 20% under the old system toolbar buttons (~30pt hit,
    /// ~13.5pt glyph, ~35pt pitch), keeping a 24pt target.
    static let toolbarIconSize: Double = 24
    static let toolbarIconGlyph: Double = 11
    static let toolbarIconSpacing: Double = 4
    /// Width of the three panel icons together, used to keep the project name
    /// clear of them. (A Needs-you count adds a few points; `toolbarNameSlack`
    /// absorbs it.)
    static var toolbarIconsWidth: Double { 3 * toolbarIconSize + 2 * toolbarIconSpacing }
    /// Height of the window's title bar / toolbar strip.
    static let toolbarHeight: Double = 52
    /// Sidebar column width (the 1pt column divider follows it).
    static let sidebarWidth: Double = 250
    /// Project mark (22pt) plus the gap before the name.
    static var projectMarkWidth: Double { 22 + iconTextSpacing }
    /// Where the project mark starts when the sidebar is hidden: past the
    /// traffic lights and the sidebar toggle (which ends at about 124pt),
    /// plus the usual inset. With the sidebar open it starts at the detail
    /// column's edge plus `contentEdge` instead, whichever is further right.
    static let projectNameStartWithoutSidebar: Double = 140
    /// Same, in full screen: there are no traffic lights, so only the sidebar
    /// toggle (ending at about 44pt) is cleared.
    static let projectNameStartFullScreen: Double = 60
    /// Breathing room between the name and the icons.
    static let toolbarNameSlack: Double = 16
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
