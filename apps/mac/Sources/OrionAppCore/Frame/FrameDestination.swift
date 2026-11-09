import Foundation

/// The places in the native sidebar.
public enum FrameDestination: Hashable, Sendable {
    case home, inspiration, taste, designSystem, settings
    case project(String)

    /// The page each place opens. A project opens its first chat (the server
    /// creates "Main" if it has none).
    public func path(workspaceID: String) -> String {
        switch self {
        case .home: "/\(workspaceID)"
        case .inspiration: "/\(workspaceID)/inspiration"
        case .taste: "/\(workspaceID)/inspiration?tab=taste"
        case .designSystem: "/\(workspaceID)/design-system"
        case .settings: "/\(workspaceID)/settings/members"
        case .project(let id): "/\(workspaceID)/projects/\(id)"
        }
    }

    /// Reads the page address back into a sidebar place. A chat page selects
    /// the project that owns it. Returns nil for pages outside the frame.
    public init?(path: String, workspaceID: String, tabs: [FrameTab]) {
        let parts = Self.pathComponents(path)
        guard parts.first == workspaceID else { return nil }
        guard parts.count > 1 else { self = .home; return }
        switch parts[1] {
        case "inspiration":
            self = Self.query(path).contains("tab=taste") ? .taste : .inspiration
        case "design-system":
            self = .designSystem
        case "settings":
            self = .settings
        case "projects" where parts.count > 2:
            self = .project(parts[2])
        case "rooms" where parts.count > 2:
            guard let tab = tabs.first(where: { $0.id == parts[2] }) else { return nil }
            self = .project(tab.projectID)
        default:
            return nil
        }
    }

    public static func pathComponents(_ path: String) -> [String] {
        let beforeQuery = path.split(separator: "?", maxSplits: 1).first.map(String.init) ?? ""
        return beforeQuery.split(separator: "/").map(String.init)
    }

    private static func query(_ path: String) -> [String] {
        guard let query = path.split(separator: "?", maxSplits: 1).dropFirst().first else { return [] }
        return query.split(separator: "&").map(String.init)
    }
}
