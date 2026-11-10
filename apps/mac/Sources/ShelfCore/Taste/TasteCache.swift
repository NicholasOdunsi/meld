import Foundation

/// The last Taste snapshot, so the board still shows something offline.
public struct TasteCache: Sendable {
    public static var defaultDirectory: URL {
        LibraryCache.defaultDirectory.deletingLastPathComponent().appending(path: "taste-cache", directoryHint: .isDirectory)
    }

    private let file: URL

    public init(directory: URL = TasteCache.defaultDirectory) {
        file = directory.appending(path: "taste.json")
    }

    public func load() -> TasteSnapshot? {
        guard let data = try? Data(contentsOf: file) else { return nil }
        return try? JSONDecoder().decode(TasteSnapshot.self, from: data)
    }

    public func save(_ snapshot: TasteSnapshot) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try JSONEncoder().encode(snapshot).write(to: file, options: .atomic)
    }
}
