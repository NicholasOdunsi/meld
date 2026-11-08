import Foundation

/// Metadata for one waiting image. Never contains the capture token.
public struct OutboxEntry: Codable, Sendable, Identifiable, Equatable {
    public let id: UUID
    public let mimeType: ImageMimeType
    public let note: String?
    public let sourceURL: URL?
    public let roomID: UUID?
    public let createdAt: Date

    public init(id: UUID, mimeType: ImageMimeType, note: String?, sourceURL: URL?, roomID: UUID?, createdAt: Date) {
        self.id = id
        self.mimeType = mimeType
        self.note = note
        self.sourceURL = sourceURL
        self.roomID = roomID
        self.createdAt = createdAt
    }
}
