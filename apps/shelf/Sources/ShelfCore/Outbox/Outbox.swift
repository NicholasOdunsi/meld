import Foundation

/// Images waiting to be sent. Each entry is `<id>.img` plus `<id>.json`, each
/// written atomically with the image first, so metadata never points at
/// missing bytes. Only entries with metadata count as pending.
public actor Outbox {
    public static var defaultDirectory: URL {
        URL.applicationSupportDirectory.appending(path: "Orion/shelf-outbox", directoryHint: .isDirectory)
    }

    private let directory: URL
    private let rejectedDirectory: URL

    public init(directory: URL = Outbox.defaultDirectory) {
        self.directory = directory
        self.rejectedDirectory = directory.appending(path: "rejected", directoryHint: .isDirectory)
    }

    @discardableResult
    public func enqueue(
        _ image: NormalizedImage,
        note: String?,
        sourceURL: URL?,
        roomID: UUID?,
        now: Date = .now
    ) throws -> OutboxEntry {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let entry = OutboxEntry(id: UUID(), mimeType: image.mimeType, note: note, sourceURL: sourceURL, roomID: roomID, createdAt: now)
        try image.data.write(to: imageURL(for: entry.id, in: directory), options: .atomic)
        try JSONEncoder().encode(entry).write(to: metadataURL(for: entry.id, in: directory), options: .atomic)
        return entry
    }

    public func pending() throws -> [OutboxEntry] {
        guard FileManager.default.fileExists(atPath: directory.path(percentEncoded: false)) else { return [] }
        let decoder = JSONDecoder()
        return try FileManager.default
            .contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" }
            // A damaged metadata file is skipped rather than failing the whole
            // read, which would stall every other entry behind it.
            .compactMap { try? decoder.decode(OutboxEntry.self, from: Data(contentsOf: $0)) }
            .sorted { $0.createdAt < $1.createdAt }
    }

    public func imageData(for entry: OutboxEntry) throws -> Data {
        try Data(contentsOf: imageURL(for: entry.id, in: directory))
    }

    public func remove(_ entry: OutboxEntry) throws {
        try FileManager.default.removeItem(at: metadataURL(for: entry.id, in: directory))
        let image = imageURL(for: entry.id, in: directory)
        if FileManager.default.fileExists(atPath: image.path(percentEncoded: false)) {
            try FileManager.default.removeItem(at: image)
        }
    }

    /// Moves an entry the server will never accept out of the queue, keeping the
    /// files so the owner can inspect them (Settings → Open outbox folder).
    public func reject(_ entry: OutboxEntry) throws {
        try FileManager.default.createDirectory(at: rejectedDirectory, withIntermediateDirectories: true)
        try FileManager.default.moveItem(
            at: metadataURL(for: entry.id, in: directory),
            to: metadataURL(for: entry.id, in: rejectedDirectory)
        )
        try FileManager.default.moveItem(
            at: imageURL(for: entry.id, in: directory),
            to: imageURL(for: entry.id, in: rejectedDirectory)
        )
    }

    private func imageURL(for id: UUID, in folder: URL) -> URL {
        folder.appending(path: "\(id.uuidString).img")
    }

    private func metadataURL(for id: UUID, in folder: URL) -> URL {
        folder.appending(path: "\(id.uuidString).json")
    }
}
