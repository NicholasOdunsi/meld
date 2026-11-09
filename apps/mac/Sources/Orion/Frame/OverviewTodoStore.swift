import Foundation
import Observation
import OrionAppCore

@MainActor
protocol TodoSyncing: AnyObject {
    func saveTodo(_ item: FrameTodo) async -> Bool
    func moveTodos(_ ids: [String], to stage: FrameTodoStage) async -> Bool
    func deleteTodos(_ ids: [String]) async -> Bool
}

/// One line on the Overview todo. Checking selects it for orchestrate; each
/// line can attach its own project. Saved lines sync through the page.
struct OverviewTodoItem: Identifiable, Equatable, Hashable {
    let id: UUID
    var text: String
    var isChecked: Bool
    var projectID: String?
    var isSaved: Bool
    var position: Double

    init(
        id: UUID = UUID(),
        text: String = "",
        isChecked: Bool = false,
        projectID: String? = nil,
        isSaved: Bool = false,
        position: Double = 0
    ) {
        self.id = id
        self.text = text
        self.isChecked = isChecked
        self.projectID = projectID
        self.isSaved = isSaved
        self.position = position
    }

    var isBlank: Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Snapshot for In progress / Completed — no editing, no selection.
    func asReadOnly() -> OverviewTodoItem {
        OverviewTodoItem(id: id, text: text, isChecked: false, projectID: projectID)
    }

    /// Like `asReadOnly()`, but keeps the saved flag and position.
    func asReadOnlyKeepingSync() -> OverviewTodoItem {
        var copy = asReadOnly()
        copy.isSaved = isSaved
        copy.position = position
        return copy
    }
}

/// Overview todo list. Remembers the last project you picked so new lines
/// start attached to it. Orchestrate moves work into In progress; completing
/// moves it into Completed. Moves and removals sync through `TodoSyncing`.
@MainActor
@Observable
final class OverviewTodoStore {
    private static let lastProjectKey = "orion.overview.lastProjectID"

    var lastProjectID: String? {
        didSet {
            if let lastProjectID {
                UserDefaults.standard.set(lastProjectID, forKey: Self.lastProjectKey)
            } else {
                UserDefaults.standard.removeObject(forKey: Self.lastProjectKey)
            }
        }
    }

    var items: [OverviewTodoItem]
    var inProgress: [OverviewTodoItem] = []
    var completed: [OverviewTodoItem] = []

    @ObservationIgnored weak var sync: TodoSyncing?
    /// The latest save/move/delete, so tests (and callers) can await it.
    @ObservationIgnored private(set) var pendingSync: Task<Void, Never>?
    /// Lines with local edits not yet committed; snapshots never overwrite them.
    @ObservationIgnored private var editing: Set<UUID> = []

    init(items: [OverviewTodoItem]? = nil) {
        let remembered = UserDefaults.standard.string(forKey: Self.lastProjectKey)
        self.lastProjectID = remembered
        self.items = items ?? [OverviewTodoItem(projectID: remembered)]
    }

    var checkedCount: Int {
        items.filter { $0.isChecked && !$0.isBlank }.count
    }

    var hasCheckedItems: Bool { checkedCount > 0 }

    private static func wireID(_ id: UUID) -> String { id.uuidString.lowercased() }

    private var nextPosition: Double {
        ((items + inProgress + completed).map(\.position).max() ?? 0) + 1
    }

    /// Merge saved lines from the page into the three lists. Keeps unsaved and in-progress edits.
    func apply(_ saved: [FrameTodo]) {
        func item(_ todo: FrameTodo) -> OverviewTodoItem? {
            guard let id = UUID(uuidString: todo.id) else { return nil }
            if todo.stage == .todo, editing.contains(id), let local = items.first(where: { $0.id == id }) {
                return local
            }
            let isChecked = items.first(where: { $0.id == id })?.isChecked ?? false
            var line = OverviewTodoItem(
                id: id,
                text: todo.text,
                isChecked: todo.stage == .todo && isChecked,
                projectID: todo.projectID
            )
            line.isSaved = true
            line.position = todo.position
            return line
        }
        let todoLines = saved.filter { $0.stage == .todo }.compactMap(item)
        let savedIDs = Set(saved.compactMap { UUID(uuidString: $0.id) })
        items = todoLines + items.filter { !$0.isSaved && !savedIDs.contains($0.id) && !$0.isBlank }
        inProgress = saved.filter { $0.stage == .inProgress }.compactMap(item).map { $0.asReadOnlyKeepingSync() }
        completed = saved.filter { $0.stage == .done }.reversed().compactMap(item).map { $0.asReadOnlyKeepingSync() }
        ensureTrailingBlank()
    }

    func setText(_ text: String, for itemID: UUID) {
        guard let index = items.firstIndex(where: { $0.id == itemID }) else { return }
        items[index].text = text
        editing.insert(itemID)
        if items[index].isBlank {
            items[index].isChecked = false
        }
    }

    func setProjectID(_ projectID: String?, for itemID: UUID) {
        guard let index = items.firstIndex(where: { $0.id == itemID }) else { return }
        items[index].projectID = projectID
        if let projectID {
            lastProjectID = projectID
        }
        if items[index].isSaved {
            save(index)
        }
    }

    func toggleChecked(_ itemID: UUID) {
        guard let index = items.firstIndex(where: { $0.id == itemID }),
              !items[index].isBlank
        else { return }
        items[index].isChecked.toggle()
    }

    func remove(_ itemID: UUID) {
        if items.first(where: { $0.id == itemID })?.isSaved == true {
            sendDelete([itemID])
        }
        items.removeAll { $0.id == itemID }
        editing.remove(itemID)
        ensureTrailingBlank()
    }

    /// Drops checked todo lines without sending them to In progress.
    @discardableResult
    func removeChecked() -> Int {
        let count = checkedCount
        guard count > 0 else { return 0 }
        let savedIDs = items.filter { $0.isChecked && !$0.isBlank && $0.isSaved }.map(\.id)
        sendDelete(savedIDs)
        for id in savedIDs { editing.remove(id) }
        items.removeAll { $0.isChecked && !$0.isBlank }
        ensureTrailingBlank()
        return count
    }

    /// Enter on a filled line: keep the text, append a fresh blank line for the next thought.
    @discardableResult
    func commitLine(_ itemID: UUID) -> UUID? {
        guard let index = items.firstIndex(where: { $0.id == itemID }) else { return nil }
        let trimmed = items[index].text.trimmingCharacters(in: .whitespacesAndNewlines)
        items[index].text = trimmed
        if trimmed.isEmpty {
            items[index].isChecked = false
            return itemID
        }
        save(index)
        if index == items.count - 1 || !(items.last?.isBlank ?? false) {
            let blank = OverviewTodoItem(projectID: lastProjectID)
            items.append(blank)
            return blank.id
        }
        return items.last?.id
    }

    /// Moves checked todo lines into In progress.
    @discardableResult
    func orchestrateChecked() -> Int {
        let moving = items.filter { $0.isChecked && !$0.isBlank }.map { $0.asReadOnlyKeepingSync() }
        guard !moving.isEmpty else { return 0 }
        let savedIDs = moving.filter(\.isSaved).map(\.id)
        items.removeAll { $0.isChecked && !$0.isBlank }
        inProgress.append(contentsOf: moving)
        ensureTrailingBlank()
        sendMove(savedIDs, to: .inProgress)
        return moving.count
    }

    /// Marks an In progress item done.
    func completeInProgress(_ itemID: UUID) {
        guard let index = inProgress.firstIndex(where: { $0.id == itemID }) else { return }
        let item = inProgress.remove(at: index)
        completed.insert(item, at: 0)
        if item.isSaved {
            sendMove([itemID], to: .done)
        }
    }

    private func save(_ index: Int) {
        let line = items[index]
        guard !line.isBlank else { return }
        if line.position == 0 { items[index].position = nextPosition }
        items[index].isSaved = true
        editing.remove(line.id)
        let todo = FrameTodo(
            id: Self.wireID(line.id),
            projectID: line.projectID,
            text: line.text,
            stage: .todo,
            position: items[index].position
        )
        guard let sync else { return }
        pendingSync = Task { _ = await sync.saveTodo(todo) }
    }

    private func sendMove(_ ids: [UUID], to stage: FrameTodoStage) {
        guard let sync, !ids.isEmpty else { return }
        let wire = ids.map(Self.wireID)
        pendingSync = Task { _ = await sync.moveTodos(wire, to: stage) }
    }

    private func sendDelete(_ ids: [UUID]) {
        guard let sync, !ids.isEmpty else { return }
        let wire = ids.map(Self.wireID)
        pendingSync = Task { _ = await sync.deleteTodos(wire) }
    }

    private func ensureTrailingBlank() {
        if items.isEmpty || !(items.last?.isBlank ?? false) {
            items.append(OverviewTodoItem(projectID: lastProjectID))
        }
        while items.count > 1,
              items.suffix(2).allSatisfy(\.isBlank),
              !items[items.count - 2].isChecked {
            items.removeLast()
        }
    }
}
