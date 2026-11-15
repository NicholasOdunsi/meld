import Foundation
import ShelfCore
import Testing
@testable import Orion

@MainActor
struct ComposerNoticeTests {
    @Test func aHintLeavesAfterFiveSecondsAnErrorStays() {
        #expect(ComposerNotice(text: "x", kind: .hint).lifetime == .seconds(5))
        #expect(ComposerNotice(text: "x", kind: .error).lifetime == nil)
    }

    @Test func showingReplacesTheCurrentNotice() {
        let center = ComposerNoticeCenter()
        #expect(center.current == nil)
        let first = center.show("first", kind: .hint)
        let second = center.show("second", kind: .error)
        #expect(center.current == second)
        #expect(first.id != second.id)
    }

    @Test func dismissingByIDOnlyClearsThatNotice() {
        let center = ComposerNoticeCenter()
        let old = center.show("old", kind: .hint)
        let newer = center.show("newer", kind: .hint)
        center.dismiss(id: old.id) // an old timer firing late must not clear the newer notice
        #expect(center.current == newer)
        center.dismiss(id: newer.id)
        #expect(center.current == nil)
    }

    @Test func dismissClearsWhateverIsShowing() {
        let center = ComposerNoticeCenter()
        center.show("x", kind: .error)
        center.dismiss()
        #expect(center.current == nil)
    }

    @Test func tasteStatesBecomeNotices() {
        #expect(TasteComposerNotice.from(.idle) == nil)
        #expect(TasteComposerNotice.from(.reading) == nil)
        #expect(TasteComposerNotice.from(.failed("Try again.")) == TasteComposerNotice(text: "Try again.", kind: .error))
        let skipped = [
            TasteComposeSkipped(name: "a.pdf", reason: "bad"),
            TasteComposeSkipped(name: "b.png", reason: "bad"),
        ]
        #expect(TasteComposerNotice.from(.noResult(skipped: skipped))
            == TasteComposerNotice(text: "Couldn't read: a.pdf, b.png. Add a few words, or try another link.", kind: .error))
        #expect(TasteComposerNotice.from(.noResult(skipped: []))
            == TasteComposerNotice(text: "Nothing new fit your Taste. Lists may be full, or try saying what to change.", kind: .error))
        #expect(TasteComposerNotice.from(.done(skipped: skipped))
            == TasteComposerNotice(text: "Couldn't read: a.pdf, b.png", kind: .error))
        #expect(TasteComposerNotice.from(.done(skipped: [])) == nil)
    }
}
