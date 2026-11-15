import Testing
@testable import OrionAppCore

struct ProjectHeaderLayoutTests {
    /// The real toolbar numbers with the sidebar hidden (as it is under Canvas).
    private func layout(window: Double, nameStart: Double = 152) -> ProjectHeaderLayout {
        ProjectHeaderLayout(windowWidth: window, nameStart: nameStart, iconsWidth: 110,
                            nameSlack: 16, panelIconGap: 12, trailingInset: 12)
    }

    @Test func canvasNeverSqueezesTheNameToNothing() {
        // Canvas is 72% of a 1000pt window: the old budget went negative and
        // the toolbar ran out of room, so AppKit collapsed the name.
        let header = layout(window: 1000)
        let name = header.nameMaxWidth(panelWidth: 720)
        #expect(name == ProjectHeaderLayout.minimumNameWidth)
        // And everything fits in the window, so nothing gets squeezed.
        let total = 152 + name! + 16 + 110 + header.spacerWidth(panelWidth: 720) + 12
        #expect(total <= 1000)
    }

    @Test func spacerGivesWayBeforeTheName() {
        let header = layout(window: 1000)
        #expect(header.spacerWidth(panelWidth: 720) < 720)
        #expect(header.spacerWidth(panelWidth: 720) >= 0)
    }

    @Test func spacerLinesUpWithThePanelWhenThereIsRoom() {
        let header = layout(window: 1600)
        #expect(header.spacerWidth(panelWidth: 360) == 360)
    }

    @Test func closingThePanelRestoresTheFullBudget() {
        let header = layout(window: 1200)
        let before = header.nameMaxWidth(panelWidth: nil)
        _ = header.nameMaxWidth(panelWidth: 864)
        #expect(header.nameMaxWidth(panelWidth: nil) == before)
        #expect(before == Double(1200 - 12 - 110 - 16 - 152))
        #expect(header.spacerWidth(panelWidth: nil) == 0)
    }

    @Test func neverNegativeOnATinyWindow() {
        let header = layout(window: 300)
        #expect(header.nameMaxWidth(panelWidth: 216) == ProjectHeaderLayout.minimumNameWidth)
        #expect(header.spacerWidth(panelWidth: 216) == 0)
    }

    @Test func noLimitBeforeTheWindowHasAWidth() {
        #expect(layout(window: 0).nameMaxWidth(panelWidth: 300) == nil)
        #expect(layout(window: 0).spacerWidth(panelWidth: 300) == 0)
    }
}
