import Foundation
import ShelfCore

struct ComposerDraft: Equatable {
    enum AddResult: Equatable { case added, tooBig, unsupported, full, duplicate, notWeb }

    var words = ""
    var files: [TasteComposeFile] = []
    var urls: [URL] = []
    var saveImagesToInspiration = false

    static let maxWords = 4000
    static let maxFiles = 6
    static let maxURLs = 3
    static let maxFileBytes = 10 * 1024 * 1024
    private static let allowed: Set<String> = ["pdf", "docx", "txt", "md", "markdown", "png", "jpg", "jpeg", "webp"]
    private static let images: Set<String> = ["png", "jpg", "jpeg", "webp"]

    private static func ext(_ name: String) -> String { (name as NSString).pathExtension.lowercased() }

    mutating func addFile(name: String, data: Data) -> AddResult {
        guard Self.allowed.contains(Self.ext(name)) else { return .unsupported }
        guard data.count <= Self.maxFileBytes else { return .tooBig }
        guard files.count < Self.maxFiles else { return .full }
        files.append(TasteComposeFile(name: name, mimeType: Self.mimeType(for: Self.ext(name)), data: data))
        return .added
    }

    mutating func addURL(_ url: URL) -> AddResult {
        guard url.scheme == "http" || url.scheme == "https", url.host() != nil else { return .notWeb }
        guard !urls.contains(url) else { return .duplicate }
        guard urls.count < Self.maxURLs else { return .full }
        urls.append(url)
        return .added
    }

    mutating func extractLinks() {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return }
        let text = words
        let matches = detector.matches(in: text, range: NSRange(text.startIndex..., in: text)).reversed()
        for match in matches {
            guard let url = match.url, let range = Range(match.range, in: text), addURL(url) == .added else { continue }
            words.replaceSubrange(range, with: "")
        }
        words = words.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    mutating func remove(fileNamed name: String) { files.removeAll { $0.name == name } }
    mutating func remove(url: URL) { urls.removeAll { $0 == url } }

    var canRead: Bool {
        let trimmed = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count <= Self.maxWords else { return false }
        return !trimmed.isEmpty || !files.isEmpty || !urls.isEmpty
    }

    var imageFiles: [TasteComposeFile] { files.filter { Self.images.contains(Self.ext($0.name)) } }

    /// A words-only message with composer suggestions waiting is a follow-up ("make it less airy"):
    /// those suggestions are replaced. Anything with files or links starts fresh.
    func replyTargets(pending: [TasteCard]) -> [String] {
        guard !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, files.isEmpty, urls.isEmpty else { return [] }
        return pending.filter { $0.origin == "composer" }.map(\.id)
    }

    func request(replyTo: [String], tile: TasteTile?) -> TasteComposeRequest {
        TasteComposeRequest(
            words: words.trimmingCharacters(in: .whitespacesAndNewlines),
            urls: urls,
            files: files,
            tile: tile,
            replyTo: replyTo
        )
    }

    private static func mimeType(for ext: String) -> String {
        switch ext {
        case "pdf": "application/pdf"
        case "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "txt": "text/plain"
        case "md", "markdown": "text/markdown"
        case "png": "image/png"
        case "jpg", "jpeg": "image/jpeg"
        case "webp": "image/webp"
        default: "application/octet-stream"
        }
    }
}
