import Foundation

public struct UploadedItem: Sendable, Equatable {
    public let entryID: UUID
    public let response: ShelfUploadResponse
}
