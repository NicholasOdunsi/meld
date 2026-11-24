import Foundation

struct PreviewEditChange: Codable, Equatable, Sendable {
    let path: String
    let before: String
    let after: String
}

/// Before/after contents of each edit, per Star. Separate from Git on purpose: a nudge is not a commit.
struct PreviewEditHistory {
    private static let limit = 100
    private var undoStack: [[PreviewEditChange]] = []
    private var redoStack: [[PreviewEditChange]] = []

    var canUndo: Bool { !undoStack.isEmpty }
    var canRedo: Bool { !redoStack.isEmpty }

    mutating func record(_ changes: [PreviewEditChange]) {
        guard !changes.isEmpty else { return }
        undoStack.append(changes)
        if undoStack.count > Self.limit { undoStack.removeFirst(undoStack.count - Self.limit) }
        redoStack.removeAll()
    }

    func nextUndo() -> [PreviewEditChange]? { undoStack.last }
    func nextRedo() -> [PreviewEditChange]? { redoStack.last }

    mutating func didUndo() { if let changes = undoStack.popLast() { redoStack.append(changes) } }
    mutating func didRedo() { if let changes = redoStack.popLast() { undoStack.append(changes) } }
}
