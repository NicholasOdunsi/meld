import Foundation

public struct ShelfUpload: Sendable, Equatable {
    public let data: Data
    public let mimeType: ImageMimeType
    public let note: String?
    public let sourceURL: URL?
    public let roomID: UUID?

    public init(data: Data, mimeType: ImageMimeType, note: String?, sourceURL: URL?, roomID: UUID?) {
        self.data = data
        self.mimeType = mimeType
        self.note = note
        self.sourceURL = sourceURL
        self.roomID = roomID
    }

    public init(entry: OutboxEntry, data: Data) {
        self.init(data: data, mimeType: entry.mimeType, note: entry.note, sourceURL: entry.sourceURL, roomID: entry.roomID)
    }
}
