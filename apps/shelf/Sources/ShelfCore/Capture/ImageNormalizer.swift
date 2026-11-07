import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Turns anything ImageIO can decode into a format Orion stores, within `Limits`.
///
/// Rules (spec B1): PNG/JPEG/WebP within limits pass through untouched;
/// HEIC/HEIF become JPEG; every other format becomes PNG; anything too long
/// or too heavy is shrunk to `maxEdge`, then `fallbackEdge`, as JPEG.
public struct ImageNormalizer: Sendable {
    private static let fullSizeQuality = 0.9
    private static let shrunkQuality = 0.85

    public init() {}

    public func normalize(_ captured: CapturedImage) throws(NormalizationError) -> NormalizedImage {
        guard
            let source = CGImageSourceCreateWithData(captured.data as CFData, nil),
            CGImageSourceGetCount(source) > 0,
            let typeIdentifier = CGImageSourceGetType(source) as String?,
            let type = UTType(typeIdentifier),
            let size = Self.pixelSize(of: source)
        else {
            throw .notAnImage
        }

        let fitsEdge = max(size.width, size.height) <= Limits.maxEdge
        if let storedType = Self.storedMimeType(for: type), fitsEdge, captured.data.count <= Limits.maxBytes {
            return NormalizedImage(data: captured.data, mimeType: storedType, width: size.width, height: size.height)
        }

        let isHEIC = type.conforms(to: .heic) || type.conforms(to: .heif)
        if fitsEdge,
           let encoded = Self.encode(source, maxEdge: nil, as: isHEIC ? .jpeg : .png),
           encoded.data.count <= Limits.maxBytes {
            return encoded
        }

        for edge in [Limits.maxEdge, Limits.fallbackEdge] {
            if let encoded = Self.encode(source, maxEdge: edge, as: .jpeg), encoded.data.count <= Limits.maxBytes {
                return encoded
            }
        }
        throw .tooLarge
    }

    private static func storedMimeType(for type: UTType) -> ImageMimeType? {
        if type.conforms(to: .png) {
            .png
        } else if type.conforms(to: .jpeg) {
            .jpeg
        } else if type.conforms(to: .webP) {
            .webp
        } else {
            nil
        }
    }

    private static func pixelSize(of source: CGImageSource) -> (width: Int, height: Int)? {
        guard
            let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
            let width = properties[kCGImagePropertyPixelWidth] as? Int,
            let height = properties[kCGImagePropertyPixelHeight] as? Int,
            width > 0, height > 0
        else {
            return nil
        }
        return (width, height)
    }

    /// Encodes the first frame (so a GIF becomes a still), optionally shrunk so its
    /// longest side is at most `maxEdge`. ImageIO never upscales a thumbnail.
    private static func encode(_ source: CGImageSource, maxEdge: Int?, as mimeType: ImageMimeType) -> NormalizedImage? {
        let image: CGImage? = if let maxEdge {
            CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxEdge,
            ] as CFDictionary)
        } else {
            CGImageSourceCreateImageAtIndex(source, 0, nil)
        }
        guard let image else { return nil }

        let output = NSMutableData()
        let type: UTType = mimeType == .png ? .png : .jpeg
        guard let destination = CGImageDestinationCreateWithData(output, type.identifier as CFString, 1, nil) else {
            return nil
        }
        let quality = maxEdge == nil ? fullSizeQuality : shrunkQuality
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return NormalizedImage(data: output as Data, mimeType: mimeType, width: image.width, height: image.height)
    }
}
