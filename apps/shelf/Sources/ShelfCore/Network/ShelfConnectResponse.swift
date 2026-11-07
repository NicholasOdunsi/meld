import Foundation

public struct ShelfConnectResponse: Codable, Sendable, Equatable {
    public let token: String
    public let workspaceId: UUID
    public let workspaceName: String

    public init(token: String, workspaceId: UUID, workspaceName: String) {
        self.token = token
        self.workspaceId = workspaceId
        self.workspaceName = workspaceName
    }
}
