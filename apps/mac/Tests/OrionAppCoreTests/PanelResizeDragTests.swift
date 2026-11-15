import Testing
@testable import OrionAppCore

struct PanelResizeDragTests {
    /// The reported window: a ~1030pt detail column.
    private let detail = 1030.0

    @Test func storedWidthOpensUnchangedInTheReportedColumn() {
        // Saved 280 (the minimum) / the 360 default: To-do and Star open at
        // exactly that, nowhere near the 55% cap (566.5pt).
        #expect(DetailSplit(detailWidth: detail, panel: .side(preferredWidth: 280)).panelWidth == 280)
        #expect(DetailSplit(detailWidth: detail, panel: .side(preferredWidth: 360)).panelWidth == 360)
        #expect(DetailSplit(detailWidth: detail, panel: .side(preferredWidth: 420)).panelWidth == 420)
    }

    @Test func aClickChangesNothing() {
        var drag = PanelResizeDrag()
        #expect(drag.change(startLocationX: 700, translation: 0, shownWidth: 280, detailWidth: detail) == nil)
        #expect(drag.change(startLocationX: 700, translation: -2, shownWidth: 280, detailWidth: detail) == nil)
        #expect(drag.liveWidth == nil)
        #expect(drag.end() == nil)
        #expect(!drag.isActive)
    }

    @Test func draggingLeftWidensLiveAndSavesOnEnd() {
        var drag = PanelResizeDrag()
        #expect(drag.change(startLocationX: 700, translation: -40, shownWidth: 360, detailWidth: detail) == 400)
        #expect(drag.change(startLocationX: 700, translation: -60, shownWidth: 999, detailWidth: detail) == 420)
        #expect(drag.end() == 420)
        #expect(drag.end() == nil) // already finished
    }

    @Test func dragsPastTheLimitsStopAtThemAndSaveWhatWasShown() {
        var wide = PanelResizeDrag()
        wide.change(startLocationX: 700, translation: -900, shownWidth: 360, detailWidth: detail)
        #expect(wide.liveWidth == 566.5)
        #expect(wide.end() == 566.5)

        var narrow = PanelResizeDrag()
        narrow.change(startLocationX: 700, translation: 500, shownWidth: 360, detailWidth: detail)
        #expect(narrow.end() == PanelWidth.minimum)
    }

    /// The bug: a drag whose `onEnded` never came (a cancelled gesture) left
    /// its start width behind, and the next drag or even a click with a
    /// little jitter resized from that stale start, so the panel jumped.
    @Test func aNewDragNeverReusesAStaleStart() {
        var drag = PanelResizeDrag()
        // First drag: from 360 out to the cap, then cancelled (no end()).
        drag.change(startLocationX: 670, translation: -400, shownWidth: 360, detailWidth: detail)
        #expect(drag.liveWidth == 566.5)
        // The saved width is now 280. A new press elsewhere, a few points of jitter:
        #expect(drag.change(startLocationX: 750, translation: -1, shownWidth: 280, detailWidth: detail) == nil)
        #expect(drag.end() == nil)
    }

    @Test func aNewDragStartsFromTheWidthShownThen() {
        var drag = PanelResizeDrag()
        drag.change(startLocationX: 670, translation: -400, shownWidth: 360, detailWidth: detail)
        // Cancelled; next drag starts at 280 and moves 20pt left.
        #expect(drag.change(startLocationX: 750, translation: -20, shownWidth: 280, detailWidth: detail) == 300)
        #expect(drag.end() == 300)
    }

    @Test func savedWidthIsReadBackSafely() {
        #expect(PanelWidth.resolveStored(nil) == PanelWidth.default)
        #expect(PanelWidth.resolveStored(280.0) == 280)
        #expect(PanelWidth.resolveStored(280) == 280)
        #expect(PanelWidth.resolveStored("300") == 300)
        #expect(PanelWidth.resolveStored("wide") == PanelWidth.default)
        #expect(PanelWidth.resolveStored(0.0) == PanelWidth.default)
        #expect(PanelWidth.resolveStored(Double.nan) == PanelWidth.default)
        #expect(PanelWidth.resolveStored(10) == PanelWidth.minimum)
        #expect(PanelWidth.resolveStored(5000.0) == PanelWidth.absoluteMaximum)
    }
}
