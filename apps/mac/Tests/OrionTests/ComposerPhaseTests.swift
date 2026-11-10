import Foundation
import Testing
@testable import Orion

struct ComposerPhaseTests {
    @Test func theComposerIsRestingUntilUsedOrFilled() {
        #expect(ComposerPhase.of(isExpanded: false, hasContent: false, isReading: false) == .resting)
        #expect(ComposerPhase.of(isExpanded: true, hasContent: false, isReading: false) == .open)
        #expect(ComposerPhase.of(isExpanded: false, hasContent: true, isReading: false) == .open)
    }

    @Test func readingWinsOverEverything() {
        #expect(ComposerPhase.of(isExpanded: false, hasContent: false, isReading: true) == .reading)
        #expect(ComposerPhase.of(isExpanded: true, hasContent: true, isReading: true) == .reading)
    }

    @Test func widthsMatchTheSpecAndNeverExceedTheWindowMinusMargin() {
        #expect(ComposerMetrics.width(for: .resting, available: 1000) == 400)
        #expect(ComposerMetrics.width(for: .open, available: 1000) == 560)
        #expect(ComposerMetrics.width(for: .reading, available: 1000) == 560)
        #expect(ComposerMetrics.width(for: .open, available: 500) == 440)
        #expect(ComposerMetrics.width(for: .resting, available: 420) == 360)
        #expect(ComposerMetrics.width(for: .open, available: 40) == 0)
    }

    @Test func sendCircleSizes() {
        #expect(ComposerMetrics.sendSize(for: .resting) == 30)
        #expect(ComposerMetrics.sendSize(for: .open) == 34)
        #expect(ComposerMetrics.sendSize(for: .reading) == 34)
    }

    @Test func theSendCircleIsBrightOnlyWhenSendingIsPossible() {
        #expect(ComposerSend.isBright(canSend: true, canEdit: true, isReading: false))
        #expect(!ComposerSend.isBright(canSend: false, canEdit: true, isReading: false))
        #expect(!ComposerSend.isBright(canSend: true, canEdit: false, isReading: false))
        #expect(!ComposerSend.isBright(canSend: true, canEdit: true, isReading: true))
    }

    @Test func readingStatusNamesWhatIsBeingRead() {
        #expect(ComposerStatusText.reading(files: [], links: []) == "Reading what you wrote…")
        #expect(ComposerStatusText.reading(files: ["Brand-guide.pdf"], links: []) == "Reading Brand-guide.pdf…")
        #expect(ComposerStatusText.reading(files: ["Brand-guide.pdf"], links: ["stripe.com/design"]) == "Reading Brand-guide.pdf, then stripe.com/design…")
        #expect(ComposerStatusText.reading(files: ["a.pdf", "b.pdf"], links: ["c.com"]) == "Reading a.pdf, then b.pdf, and 1 more…")
        #expect(ComposerStatusText.readingDetail == "Looking for lettering, shape and spacing. Nothing changes until you press Keep.")
    }
}
