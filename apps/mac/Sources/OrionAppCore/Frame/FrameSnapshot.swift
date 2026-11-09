import Foundation

public enum FrameTodoStage: String, Sendable {
    case todo
    case inProgress = "in_progress"
    case done
}

/// One saved Overview to-do line, as posted by the page.
public struct FrameTodo: Equatable, Sendable, Identifiable {
    public let id: String
    public let projectID: String?
    public let text: String
    public let stage: FrameTodoStage
    public let position: Double

    public init(id: String, projectID: String?, text: String, stage: FrameTodoStage, position: Double) {
        self.id = id
        self.projectID = projectID
        self.text = text
        self.stage = stage
        self.position = position
    }
}

/// Everything the native frame draws, as last posted by the Orion page
/// (bridge message `frame`, see apps/web/src/features/native/bridge.ts).
public struct FrameSnapshot: Equatable, Sendable {
    public let workspaceID: String
    /// The page's address relative to the site, e.g. "/<ws>/rooms/<id>?tab=prd".
    public let path: String
    public let projects: [FrameProject]
    public let tabs: [FrameTab]
    public let hasTasteUpdates: Bool
    /// Non-idle project hats, keyed by project id. Missing means idle.
    public let projectActivity: [String: FrameActivity]
    /// Non-idle tab hats, keyed by room/tab id. Missing means idle.
    public let tabActivity: [String: FrameActivity]
    /// Saved Overview to-dos from the page, sorted by position.
    public let todos: [FrameTodo]

    public init(
        workspaceID: String,
        path: String,
        projects: [FrameProject],
        tabs: [FrameTab],
        hasTasteUpdates: Bool,
        projectActivity: [String: FrameActivity] = [:],
        tabActivity: [String: FrameActivity] = [:],
        todos: [FrameTodo] = []
    ) {
        self.workspaceID = workspaceID
        self.path = path
        self.projects = projects
        self.tabs = tabs
        self.hasTasteUpdates = hasTasteUpdates
        self.projectActivity = projectActivity
        self.tabActivity = tabActivity
        self.todos = todos
    }

    static let maxItems = 500

    /// Lenient about extra fields, strict about the ones it needs. Rows with
    /// missing fields are dropped rather than failing the whole snapshot.
    static func decode(_ fields: [String: Any]) -> FrameSnapshot? {
        guard let workspaceID = fields["workspaceId"] as? String, !workspaceID.isEmpty,
              let path = fields["path"] as? String, path.hasPrefix("/"), !path.hasPrefix("//") else { return nil }
        let projects = (fields["projects"] as? [[String: Any]] ?? []).prefix(maxItems).compactMap { row -> FrameProject? in
            guard let id = row["id"] as? String, let name = row["name"] as? String else { return nil }
            return FrameProject(id: id, name: name, icon: row["icon"] as? String ?? "folder", color: row["color"] as? String ?? "blue")
        }
        let tabs = (fields["tabs"] as? [[String: Any]] ?? []).prefix(maxItems).compactMap { row -> FrameTab? in
            guard let id = row["id"] as? String, let projectID = row["projectId"] as? String,
                  let name = row["name"] as? String else { return nil }
            return FrameTab(id: id, projectID: projectID, name: name, createdAt: row["createdAt"] as? String ?? "")
        }
        let activity = fields["activity"] as? [String: Any]
        let todos = (fields["todos"] as? [[String: Any]] ?? []).prefix(maxItems).compactMap { row -> FrameTodo? in
            guard let id = row["id"] as? String, !id.isEmpty,
                  let text = row["text"] as? String,
                  !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let stage = (row["stage"] as? String).flatMap(FrameTodoStage.init(rawValue:)) else { return nil }
            let position = (row["position"] as? NSNumber)?.doubleValue ?? 0
            return FrameTodo(id: id, projectID: row["projectId"] as? String, text: text, stage: stage, position: position)
        }.sorted { $0.position == $1.position ? $0.id < $1.id : $0.position < $1.position }
        return FrameSnapshot(
            workspaceID: workspaceID,
            path: path,
            projects: Array(projects),
            tabs: Array(tabs),
            hasTasteUpdates: fields["hasTasteUpdates"] as? Bool ?? false,
            projectActivity: FrameActivity.decodeMap(activity?["projects"]),
            tabActivity: FrameActivity.decodeMap(activity?["tabs"]),
            todos: Array(todos)
        )
    }

    /// A project's tabs, oldest (its Main) first; ties fall back to id.
    public func tabs(in projectID: String) -> [FrameTab] {
        tabs.filter { $0.projectID == projectID }.sorted {
            $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt
        }
    }

    /// The room (chat tab) the page is showing, if any.
    public var currentRoomID: String? {
        let parts = FrameDestination.pathComponents(path)
        guard parts.count >= 3, parts[1] == "rooms" else { return nil }
        return parts[2]
    }

    /// Where the sidebar selection should sit for the page being shown.
    public var destination: FrameDestination? {
        FrameDestination(path: path, workspaceID: workspaceID, tabs: tabs)
    }
}
