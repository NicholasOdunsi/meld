import Foundation
import OrionAppCore
import Testing
@testable import Orion

@MainActor
struct OverviewTodoStoreTests {
    @Test func startsWithOneBlankLine() {
        let store = OverviewTodoStore(items: [OverviewTodoItem()])
        #expect(store.items.count == 1)
        #expect(store.items[0].isBlank)
        #expect(store.hasCheckedItems == false)
        #expect(store.inProgress.isEmpty)
        #expect(store.completed.isEmpty)
    }

    @Test func enterOnFilledLineAddsAnotherBlank() {
        let store = OverviewTodoStore(items: [OverviewTodoItem()])
        let first = store.items[0].id
        store.setText("Ship the overview", for: first)
        let next = store.commitLine(first)
        #expect(store.items.count == 2)
        #expect(store.items[0].text == "Ship the overview")
        #expect(store.items[1].isBlank)
        #expect(next == store.items[1].id)
    }

    @Test func projectAttachesPerLineAndRemembersForNext() {
        let store = OverviewTodoStore(items: [OverviewTodoItem()])
        let first = store.items[0].id
        store.setText("Do the thing", for: first)
        store.setProjectID("proj-1", for: first)
        _ = store.commitLine(first)
        #expect(store.items[0].projectID == "proj-1")
        #expect(store.lastProjectID == "proj-1")
        #expect(store.items[1].projectID == "proj-1")
    }

    @Test func orchestrateMovesCheckedIntoInProgress() {
        let store = OverviewTodoStore(items: [OverviewTodoItem()])
        let first = store.items[0].id
        store.setText("Do the thing", for: first)
        store.toggleChecked(first)
        #expect(store.orchestrateChecked() == 1)
        #expect(store.items.count == 1)
        #expect(store.items[0].isBlank)
        #expect(store.inProgress.map(\.text) == ["Do the thing"])
        #expect(store.hasCheckedItems == false)
    }

    @Test func completeInProgressMovesToCompleted() {
        let store = OverviewTodoStore(items: [OverviewTodoItem()])
        let first = store.items[0].id
        store.setText("Ship it", for: first)
        store.toggleChecked(first)
        _ = store.orchestrateChecked()
        let progressID = store.inProgress[0].id
        store.completeInProgress(progressID)
        #expect(store.inProgress.isEmpty)
        #expect(store.completed.map(\.text) == ["Ship it"])
    }
}

@MainActor
final class FakeTodoSync: TodoSyncing {
    var saved: [FrameTodo] = []
    var moved: [([String], FrameTodoStage)] = []
    var deleted: [[String]] = []
    func saveTodo(_ item: FrameTodo) async -> Bool { saved.append(item); return true }
    func moveTodos(_ ids: [String], to stage: FrameTodoStage) async -> Bool { moved.append((ids, stage)); return true }
    func deleteTodos(_ ids: [String]) async -> Bool { deleted.append(ids); return true }
}

@MainActor
struct OverviewTodoSyncTests {
    private func wire(_ id: UUID) -> String { id.uuidString.lowercased() }

    @Test func applySplitsSavedLinesIntoTheThreeLists() {
        let store = OverviewTodoStore(items: nil)
        let a = UUID(), b = UUID(), c = UUID()
        store.apply([
            FrameTodo(id: wire(a), projectID: "p1", text: "Draft pricing", stage: .todo, position: 1),
            FrameTodo(id: wire(b), projectID: nil, text: "Build onboarding", stage: .inProgress, position: 2),
            FrameTodo(id: wire(c), projectID: nil, text: "Write the PRD", stage: .done, position: 3),
        ])
        #expect(store.items.map(\.text) == ["Draft pricing", ""])
        #expect(store.items[0].isSaved)
        #expect(store.inProgress.map(\.text) == ["Build onboarding"])
        #expect(store.completed.map(\.text) == ["Write the PRD"])
    }

    @Test func commitSavesTheLine() async {
        let store = OverviewTodoStore(items: nil)
        let sync = FakeTodoSync()
        store.sync = sync
        let first = store.items[0].id
        store.setText("Ship it", for: first)
        _ = store.commitLine(first)
        await store.pendingSync?.value
        #expect(sync.saved.map(\.text) == ["Ship it"])
        #expect(sync.saved.first?.id == wire(first))
        #expect(store.items[0].isSaved)
    }

    @Test func applyNeverOverwritesALineBeingEdited() {
        let store = OverviewTodoStore(items: nil)
        let id = UUID()
        store.apply([FrameTodo(id: wire(id), projectID: nil, text: "Old", stage: .todo, position: 1)])
        store.setText("Typing…", for: id)
        store.apply([FrameTodo(id: wire(id), projectID: nil, text: "Old", stage: .todo, position: 1)])
        #expect(store.items[0].text == "Typing…")
    }

    @Test func orchestrateMovesSavedLinesToInProgress() async {
        let store = OverviewTodoStore(items: nil)
        let sync = FakeTodoSync()
        store.sync = sync
        let id = UUID()
        store.apply([FrameTodo(id: wire(id), projectID: nil, text: "Ship it", stage: .todo, position: 1)])
        store.toggleChecked(id)
        #expect(store.orchestrateChecked() == 1)
        await store.pendingSync?.value
        #expect(sync.moved.first?.0 == [wire(id)])
        #expect(sync.moved.first?.1 == .inProgress)
    }

    @Test func completingMovesToDone() async {
        let store = OverviewTodoStore(items: nil)
        let sync = FakeTodoSync()
        store.sync = sync
        let id = UUID()
        store.apply([FrameTodo(id: wire(id), projectID: nil, text: "Ship it", stage: .inProgress, position: 1)])
        store.completeInProgress(id)
        await store.pendingSync?.value
        #expect(sync.moved.first?.1 == .done)
        #expect(store.completed.map(\.text) == ["Ship it"])
    }

    @Test func removeDeletesASavedLine() async {
        let store = OverviewTodoStore(items: nil)
        let sync = FakeTodoSync()
        store.sync = sync
        let id = UUID()
        store.apply([FrameTodo(id: wire(id), projectID: nil, text: "Ship it", stage: .todo, position: 1)])
        store.remove(id)
        await store.pendingSync?.value
        #expect(sync.deleted == [[wire(id)]])
    }
}
