import Foundation

/// An image ready to upload: a stored format, within `Limits`.
public struct NormalizedImage: Sendable, Equatable {
    public let data: Data
    public let mimeType: ImageMimeType
    public let width: Int
    public let height: Int

    public init(data: Data, mimeType: ImageMimeType, width: Int, height: Int) {
        self.data = data
        self.mimeType = mimeType
        self.width = width
        self.height = height
    }
}
