import Foundation
import Testing
@testable import ShelfCore

struct LibraryCacheTests {
    let directory = URL.temporaryDirectory.appending(path: "lib-cache-\(UUID().uuidString)", directoryHint: .isDirectory)

    /// Parsed via the same ISO form LibraryDates uses, so encode → decode equality holds.
    static let createdAt = try! Date(
        "2026-11-09T14:02:00.123Z",
        strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)
    )

    static func item(_ id: UUID = UUID()) -> LibraryItem {
        LibraryItem(id: id, width: 4, height: 3, mimeType: .png, note: "n", sourceUrl: nil,
                    createdAt: createdAt, description: nil,
                    labelState: .pending, rooms: [], imageUrl: URL(string: "https://signed/a"))
    }

    @Test func savesAndLoadsTheLastPage() throws {
        let cache = LibraryCache(directory: directory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let items = [Self.item(), Self.item()]
        try cache.save(items)
        #expect(cache.load() == items)
    }

    @Test func missingOrBrokenCacheIsEmpty() throws {
        let cache = LibraryCache(directory: directory)
        defer { try? FileManager.default.removeItem(at: directory) }
        #expect(cache.load().isEmpty)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data("nope".utf8).write(to: directory.appending(path: "library.json"))
        #expect(cache.load().isEmpty)
    }
}
