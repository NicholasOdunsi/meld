import Foundation

/// One saved inspiration image as the native wall needs it.
public struct LibraryItem: Codable, Sendable, Hashable, Identifiable {
    public enum LabelState: String, Codable, Sendable {
        case pending, done, skipped
    }

    public let id: UUID
    public let width: Int
    public let height: Int
    public let mimeType: ImageMimeType
    public var note: String?
    public let sourceUrl: String?
    public let createdAt: Date
    public let description: String?
    public let labelState: LabelState
    public var rooms: [ShelfRoom]
    public let imageUrl: URL?

    public init(
        id: UUID, width: Int, height: Int, mimeType: ImageMimeType, note: String?, sourceUrl: String?,
        createdAt: Date, description: String?, labelState: LabelState, rooms: [ShelfRoom], imageUrl: URL?
    ) {
        self.id = id
        self.width = width
        self.height = height
        self.mimeType = mimeType
        self.note = note
        self.sourceUrl = sourceUrl
        self.createdAt = createdAt
        self.description = description
        self.labelState = labelState
        self.rooms = rooms
        self.imageUrl = imageUrl
    }

    /// Width ÷ height; drives the masonry tile height before the picture loads.
    public var aspectRatio: Double { Double(width) / Double(max(height, 1)) }

    /// The source link, only if it's a web address.
    public var sourceURL: URL? {
        guard let sourceUrl, let url = URL(string: sourceUrl), url.scheme == "https" || url.scheme == "http" else { return nil }
        return url
    }
}
