import AppKit
import UniformTypeIdentifiers

/// Reads images from a pasteboard: image data placed by browsers and apps,
/// or image files dragged from Finder. Keeps the web URL when a browser supplies one.
public struct PasteboardReader: Sendable {
    public init() {}

    @MainActor
    public func images(from pasteboard: NSPasteboard) -> [CapturedImage] {
        (pasteboard.pasteboardItems ?? []).compactMap(Self.image(from:))
    }

    @MainActor
    private static func image(from item: NSPasteboardItem) -> CapturedImage? {
        if let fileData = imageFileData(from: item) {
            return CapturedImage(data: fileData, sourceURL: nil)
        }
        guard
            let imageType = item.types.first(where: { UTType($0.rawValue)?.conforms(to: .image) == true }),
            let data = item.data(forType: imageType)
        else {
            return nil
        }
        return CapturedImage(data: data, sourceURL: webURL(from: item))
    }

    @MainActor
    private static func imageFileData(from item: NSPasteboardItem) -> Data? {
        guard
            let fileURLString = item.string(forType: .fileURL),
            let fileURL = URL(string: fileURLString),
            let type = UTType(filenameExtension: fileURL.pathExtension),
            type.conforms(to: .image)
        else {
            return nil
        }
        return try? Data(contentsOf: fileURL)
    }

    @MainActor
    private static func webURL(from item: NSPasteboardItem) -> URL? {
        guard
            let string = item.string(forType: .URL),
            string.count <= Limits.sourceURLMax,
            let url = URL(string: string),
            url.scheme == "http" || url.scheme == "https"
        else {
            return nil
        }
        return url
    }
}
