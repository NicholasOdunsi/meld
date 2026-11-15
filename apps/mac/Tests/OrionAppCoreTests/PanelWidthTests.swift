import Testing
@testable import OrionAppCore

struct PanelWidthTests {
    @Test func raisesTooNarrowToTheMinimum() {
        #expect(PanelWidth.clamp(100, windowWidth: 1400) == 280)
    }

    @Test func keepsAWidthInRange() {
        #expect(PanelWidth.clamp(360, windowWidth: 1400) == 360)
    }

    @Test func capsAtTheAbsoluteMaximumOnAWideWindow() {
        // 55% of 2000 is 1100, so the 640 cap wins.
        #expect(PanelWidth.clamp(900, windowWidth: 2000) == 640)
    }

    @Test func capsAtTheWindowFractionOnANarrowerWindow() {
        // 55% of 1000 is 550, below the 640 cap.
        #expect(PanelWidth.clamp(900, windowWidth: 1000) == 550)
    }

    @Test func minimumWinsOnATinyWindow() {
        // 55% of 400 is 220, below the minimum, so the panel stays at 280.
        #expect(PanelWidth.clamp(500, windowWidth: 400) == 280)
        #expect(PanelWidth.maximum(windowWidth: 400) == 280)
    }

    @Test func defaultIsInsideTheRange() {
        #expect(PanelWidth.default == 360)
        #expect(PanelWidth.clamp(PanelWidth.default, windowWidth: 800) == 360)
    }
}
