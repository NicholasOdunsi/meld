/// The only formats Orion stores.
public enum ImageMimeType: String, Codable, Sendable {
    case png = "image/png"
    case jpeg = "image/jpeg"
    case webp = "image/webp"

    public var fileExtension: String {
        switch self {
        case .png: "png"
        case .jpeg: "jpg"
        case .webp: "webp"
        }
    }
}
