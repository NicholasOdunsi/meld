import Foundation

public enum ConnectionState: Equatable, Sendable {
    case disconnected
    case connected(workspaceID: UUID, workspaceName: String)
}
