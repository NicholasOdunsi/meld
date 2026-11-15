import Testing
@testable import OrionAppCore

struct DetailSplitTests {
    private func close(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 0.0001 }

    /// The three parts always add up to the column: nothing overflows it.
    private func expectFills(_ split: DetailSplit, _ detail: Double) {
        #expect(close(split.chatWidth + split.dividerWidth + split.panelWidth, detail))
        #expect(split.chatWidth >= 0)
        #expect(split.panelWidth >= 0)
    }

    @Test func noPanelGivesTheChatEverything() {
        let split = DetailSplit(detailWidth: 1000, panel: nil)
        #expect(split.chatWidth == 1000)
        #expect(split.panelWidth == 0)
        #expect(split.dividerWidth == 0)
    }

    @Test func wideWindowCanvasTakesItsShare() {
        // 1600pt column: 72% is 1152, leaving 447 for the chat.
        let split = DetailSplit(detailWidth: 1600, panel: .canvas)
        #expect(close(split.panelWidth, 1152))
        #expect(close(split.chatWidth, 447))
        expectFills(split, 1600)
    }

    @Test func wideWindowArtifactsUseTheDraggedSideWidth() {
        let split = DetailSplit(detailWidth: 1600, panel: .side(preferredWidth: 360))
        #expect(close(split.panelWidth, 360))
        expectFills(split, 1600)
    }

    @Test func minimumWindowWithSidebarAndCanvasKeepsTheChatReadable() {
        // 900pt window minus the 251pt sidebar is a 649pt column. 72% would
        // be 467pt of Canvas and only 181pt of chat; the chat keeps 360.
        let split = DetailSplit(detailWidth: 649, panel: .canvas)
        #expect(split.chatWidth == DetailSplit.minimumChatWidth)
        #expect(split.panelWidth == 288)
        expectFills(split, 649)
    }

    @Test func screenshotWindowCanvasNoLongerOverflows() {
        // The reported window: ~1035pt column. Canvas used to be 745pt and the
        // chat couldn't shrink to the 289pt left, so the row overflowed.
        let split = DetailSplit(detailWidth: 1035, panel: .canvas)
        #expect(split.chatWidth == 360)
        #expect(split.panelWidth == 674)
        expectFills(split, 1035)
    }

    @Test func todoUsesTheDraggedWidth() {
        let split = DetailSplit(detailWidth: 1200, panel: .side(preferredWidth: 420))
        #expect(split.panelWidth == 420)
        #expect(split.chatWidth == 779)
        expectFills(split, 1200)
    }

    @Test func todoDraggedTooWideStillLeavesTheChatItsMinimum() {
        // PanelWidth allows 55% of 700 = 385, but the chat needs 360 of the 699.
        let split = DetailSplit(detailWidth: 700, panel: .side(preferredWidth: 640))
        #expect(split.panelWidth == 339)
        #expect(split.chatWidth == 360)
        #expect(DetailSplit.maximumSidePanelWidth(detailWidth: 700) == 339)
    }

    @Test func todoDraggedTooNarrowStopsAtThePanelMinimum() {
        let split = DetailSplit(detailWidth: 1200, panel: .side(preferredWidth: 50))
        #expect(split.panelWidth == PanelWidth.minimum)
    }

    @Test func tinyWindowKeepsThePanelMinimumAndShrinksTheChat() {
        // Not enough room for both minimums: the open panel stays usable,
        // the chat takes what's left (and clips/wraps inside it).
        let split = DetailSplit(detailWidth: 500, panel: .canvas)
        #expect(split.panelWidth == PanelWidth.minimum)
        #expect(split.chatWidth == 219)
        expectFills(split, 500)
    }

    @Test func columnNarrowerThanThePanelMinimumNeverGoesNegative() {
        let split = DetailSplit(detailWidth: 200, panel: .side(preferredWidth: 360))
        #expect(split.chatWidth == 0)
        #expect(split.panelWidth == 199)
        expectFills(split, 200)
    }

    @Test func zeroOrBrokenWidthIsEmpty() {
        #expect(DetailSplit(detailWidth: 0, panel: .canvas).panelWidth == 0)
        #expect(DetailSplit(detailWidth: .nan, panel: .canvas).chatWidth == 0)
        #expect(DetailSplit(detailWidth: -10, panel: .side(preferredWidth: 360)).panelWidth == 0)
    }
}
