import Foundation

/// One chat tab inside a project. On the server this is a room.
public struct FrameTab: Identifiable, Equatable, Sendable {
    public let id: String
    public let projectID: String
    public let name: String
    /// ISO-8601 from the server; compared as text, which sorts correctly.
    public let createdAt: String

    public init(id: String, projectID: String, name: String, createdAt: String) {
        self.id = id
        self.projectID = projectID
        self.name = name
        self.createdAt = createdAt
    }
}
