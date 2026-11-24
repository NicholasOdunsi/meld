import Testing
@testable import Orion

struct PreviewEditHistoryTests {
    private func change(_ before: String, _ after: String) -> [PreviewEditChange] {
        [PreviewEditChange(path: "app/page.tsx", before: before, after: after)]
    }

    @Test func undoAndRedoWalkTheRecordedEdits() {
        var history = PreviewEditHistory()
        history.record(change("a", "b"))
        history.record(change("b", "c"))
        #expect(history.canUndo && !history.canRedo)
        #expect(history.nextUndo() == change("b", "c"))
        history.didUndo()
        #expect(history.nextUndo() == change("a", "b"))
        #expect(history.nextRedo() == change("b", "c"))
        history.didRedo()
        #expect(history.nextRedo() == nil)
    }

    @Test func aNewEditClearsRedo() {
        var history = PreviewEditHistory()
        history.record(change("a", "b"))
        history.didUndo()
        #expect(history.canRedo)
        history.record(change("a", "z"))
        #expect(!history.canRedo)
    }

    @Test func keepsOnlyTheLatestHundred() {
        var history = PreviewEditHistory()
        for index in 0..<150 { history.record(change("\(index)", "\(index + 1)")) }
        var undone = 0
        while history.canUndo { history.didUndo(); undone += 1 }
        #expect(undone == 100)
    }
}
