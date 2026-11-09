import Foundation

/// The last list the wall showed, so Inspiration still shows something offline.
public struct LibraryCache: Sendable {
    public static var defaultDirectory: URL {
        URL.applicationSupportDirectory.appending(path: "Orion/inspiration-cache", directoryHint: .isDirectory)
    }

    private let file: URL

    public init(directory: URL = LibraryCache.defaultDirectory) {
        file = directory.appending(path: "library.json")
    }

    public func save(_ items: [LibraryItem]) throws {
        try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try LibraryDates.encoder.encode(items).write(to: file, options: .atomic)
    }

    public func load() -> [LibraryItem] {
        guard let data = try? Data(contentsOf: file) else { return [] }
        return (try? LibraryDates.decoder.decode([LibraryItem].self, from: data)) ?? []
    }
}
