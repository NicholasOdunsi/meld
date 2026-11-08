import Foundation

/// A room the shelf may add images to. Names only: the shelf's key cannot read room content.
public struct ShelfRoom: Codable, Sendable, Hashable, Identifiable {
    public let roomId: UUID
    public let roomName: String
    public let projectName: String

    public var id: UUID { roomId }

    public init(roomId: UUID, roomName: String, projectName: String) {
        self.roomId = roomId
        self.roomName = roomName
        self.projectName = projectName
    }
}
