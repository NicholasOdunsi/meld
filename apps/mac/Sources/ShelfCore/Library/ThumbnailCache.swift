import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Downloads each image once, keeps a small copy for the wall and the full
/// file for Quick Look / drag-out. Image transforms are a paid Supabase
/// feature, so the Mac does the shrinking.
public actor ThumbnailCache {
    private let directory: URL
    private let session: URLSession

    public init(
        directory: URL = LibraryCache.defaultDirectory.appending(path: "thumbnails", directoryHint: .isDirectory),
        session: URLSession = .shared
    ) {
        self.directory = directory
        self.session = session
    }

    public func thumbnail(for item: LibraryItem, maxPixels: Int) async -> CGImage? {
        let thumbFile = directory.appending(path: "\(item.id.uuidString)-\(maxPixels).png")
        if let image = Self.image(at: thumbFile) { return image }
        guard let full = try? await fullImageFile(for: item),
              let source = CGImageSourceCreateWithURL(full as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ]
        guard let thumb = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        Self.write(thumb, to: thumbFile)
        return thumb
    }

    public func fullImageFile(for item: LibraryItem) async throws -> URL {
        let file = directory.appending(path: "full/inspiration-\(item.id.uuidString.prefix(8).lowercased()).\(item.mimeType.fileExtension)")
        if FileManager.default.fileExists(atPath: file.path()) { return file }
        guard let url = item.imageUrl else { throw URLError(.badURL) }
        // Demo / fake library items use data: URLs; URLSession won't give an HTTP
        // status for those, so read the bytes directly.
        let data: Data
        if url.scheme?.lowercased() == "data" {
            data = try Data(contentsOf: url)
            guard !data.isEmpty else { throw URLError(.badServerResponse) }
        } else {
            let (downloaded, response) = try await session.data(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), !downloaded.isEmpty else {
                throw URLError(.badServerResponse)
            }
            data = downloaded
        }
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: file, options: .atomic)
        return file
    }

    private static func image(at file: URL) -> CGImage? {
        guard let source = CGImageSourceCreateWithURL(file as CFURL, nil) else { return nil }
        return CGImageSourceCreateImageAtIndex(source, 0, nil)
    }

    private static func write(_ image: CGImage, to file: URL) {
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        guard let destination = CGImageDestinationCreateWithURL(file as CFURL, UTType.png.identifier as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(destination, image, nil)
        CGImageDestinationFinalize(destination)
    }
}
