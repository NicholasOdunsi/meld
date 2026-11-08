import Foundation

public struct ShelfUploadResponse: Codable, Sendable, Equatable {
    public let itemId: UUID
    public let duplicate: Bool
    public let roomLinked: Bool

    public init(itemId: UUID, duplicate: Bool, roomLinked: Bool) {
        self.itemId = itemId
        self.duplicate = duplicate
        self.roomLinked = roomLinked
    }
}
