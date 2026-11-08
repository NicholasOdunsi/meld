import Foundation
import Testing
@testable import ShelfCore

struct OutboxTests {
    let directory = URL.temporaryDirectory.appending(path: "outbox-\(UUID().uuidString)", directoryHint: .isDirectory)
    let image = NormalizedImage(data: Data([1, 2, 3]), mimeType: .png, width: 1, height: 1)

    @Test func enqueuedEntriesComeBackOldestFirstWithTheirBytes() async throws {
        let outbox = Outbox(directory: directory)
        let first = try await outbox.enqueue(image, note: "a", sourceURL: nil, roomID: nil, now: Date(timeIntervalSince1970: 1))
        let second = try await outbox.enqueue(image, note: nil, sourceURL: URL(string: "https://x.com"), roomID: UUID(), now: Date(timeIntervalSince1970: 2))

        #expect(try await outbox.pending() == [first, second])
        #expect(try await outbox.imageData(for: first) == image.data)
    }

    @Test func survivesARestart() async throws {
        let entry = try await Outbox(directory: directory).enqueue(image, note: nil, sourceURL: nil, roomID: nil, now: .now)
        #expect(try await Outbox(directory: directory).pending() == [entry])
    }

    @Test func removeDeletesTheEntry() async throws {
        let outbox = Outbox(directory: directory)
        let entry = try await outbox.enqueue(image, note: nil, sourceURL: nil, roomID: nil, now: .now)
        try await outbox.remove(entry)
        #expect(try await outbox.pending().isEmpty)
    }

    @Test func rejectMovesTheEntryAside() async throws {
        let outbox = Outbox(directory: directory)
        let entry = try await outbox.enqueue(image, note: nil, sourceURL: nil, roomID: nil, now: .now)
        try await outbox.reject(entry)
        #expect(try await outbox.pending().isEmpty)
        let rejected = directory.appending(path: "rejected/\(entry.id.uuidString).json")
        #expect(FileManager.default.fileExists(atPath: rejected.path(percentEncoded: false)))
    }

    @Test func ignoresImageFilesWithoutMetadata() async throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try Data([9]).write(to: directory.appending(path: "\(UUID().uuidString).img"))
        #expect(try await Outbox(directory: directory).pending().isEmpty)
    }

    @Test func skipsDamagedMetadataWithoutHidingGoodEntries() async throws {
        let outbox = Outbox(directory: directory)
        let good = try await outbox.enqueue(NormalizedImage(data: Data([1]), mimeType: .png, width: 1, height: 1), note: nil, sourceURL: nil, roomID: nil)
        try Data("not json".utf8).write(to: directory.appending(path: "\(UUID().uuidString).json"))
        #expect(try await outbox.pending().map(\.id) == [good.id])
    }

    @Test func anEmptyOrMissingDirectoryHasNothingPending() async throws {
        #expect(try await Outbox(directory: directory).pending().isEmpty)
    }
}
