import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct UploaderTests {
    let outbox = Outbox(directory: URL.temporaryDirectory.appending(path: "uploader-\(UUID().uuidString)", directoryHint: .isDirectory))
    let image = NormalizedImage(data: Data([1]), mimeType: .png, width: 1, height: 1)

    private func ok() -> Result<ShelfUploadResponse, ShelfAPIError> {
        .success(ShelfUploadResponse(itemId: UUID(), duplicate: false, roomLinked: false))
    }

    private func enqueue(_ count: Int) async throws -> [OutboxEntry] {
        var entries: [OutboxEntry] = []
        for index in 0..<count {
            entries.append(try await outbox.enqueue(image, note: nil, sourceURL: nil, roomID: nil, now: Date(timeIntervalSince1970: Double(index))))
        }
        return entries
    }

    @Test func uploadsEverythingAndEmptiesTheOutbox() async throws {
        let entries = try await enqueue(2)
        let client = FakeOrionClient(uploadResults: [ok(), ok()])
        let uploader = Uploader(outbox: outbox, client: client, tokenStore: InMemoryTokenStore(token: "orion_cap_t"))

        let report = await uploader.drain()

        #expect(report.uploaded.map(\.entryID) == entries.map(\.id))
        #expect(report.remaining == 0)
        #expect(report.retryAfter == nil)
        #expect(await client.tokensSeen == ["orion_cap_t", "orion_cap_t"])
    }

    @Test func rejectsWhatTheServerWillNeverAcceptAndKeepsGoing() async throws {
        _ = try await enqueue(2)
        let tooLarge = ShelfAPIError(code: .tooLarge, message: "Too large to save.")
        let uploader = Uploader(outbox: outbox, client: FakeOrionClient(uploadResults: [.failure(tooLarge), ok()]), tokenStore: InMemoryTokenStore(token: "t"))

        let report = await uploader.drain()

        #expect(report.rejected == [tooLarge])
        #expect(report.uploaded.count == 1)
        #expect(report.remaining == 0)
    }

    @Test func stopsAndKeepsEverythingWhenUnauthorized() async throws {
        _ = try await enqueue(2)
        let unauthorized = ShelfAPIError(code: .unauthorized, message: "Reconnect")
        let uploader = Uploader(outbox: outbox, client: FakeOrionClient(uploadResults: [.failure(unauthorized)]), tokenStore: InMemoryTokenStore(token: "t"))

        let report = await uploader.drain()

        #expect(report.isUnauthorized)
        #expect(report.remaining == 2)
    }

    @Test func withoutATokenNothingIsSent() async throws {
        _ = try await enqueue(1)
        let client = FakeOrionClient(uploadResults: [ok()])
        let report = await Uploader(outbox: outbox, client: client, tokenStore: InMemoryTokenStore(token: nil)).drain()

        #expect(report.isUnauthorized)
        #expect(report.remaining == 1)
        #expect(await client.uploads.isEmpty)
    }

    @Test func backsOffOnServerTroubleAndResetsAfterSuccess() async throws {
        _ = try await enqueue(1)
        let unavailable = ShelfAPIError(code: .unavailable, message: "later")
        let uploader = Uploader(
            outbox: outbox,
            client: FakeOrionClient(uploadResults: [.failure(unavailable), .failure(.network), ok()]),
            tokenStore: InMemoryTokenStore(token: "t")
        )

        #expect(await uploader.drain().retryAfter == .seconds(2))
        #expect(await uploader.drain().retryAfter == .seconds(4))
        let final = await uploader.drain()
        #expect(final.retryAfter == nil)
        #expect(final.remaining == 0)
    }

    @Test func sendsAnImageCapturedWhileTheDrainWasRunning() async throws {
        _ = try await enqueue(1)
        let client = EnqueueingClient(outbox: outbox, image: image)
        let uploader = Uploader(outbox: outbox, client: client, tokenStore: InMemoryTokenStore(token: "t"))

        let report = await uploader.drain()

        #expect(report.uploaded.count == 2)
        #expect(report.remaining == 0)
    }
}

/// Enqueues one more image during the first upload, like a capture arriving mid-drain.
private actor EnqueueingClient: OrionClient {
    let outbox: Outbox
    let image: NormalizedImage
    private var hasEnqueued = false

    init(outbox: Outbox, image: NormalizedImage) {
        self.outbox = outbox
        self.image = image
    }

    func connect(code: String, deviceName: String) async throws(ShelfAPIError) -> ShelfConnectResponse {
        throw .network
    }

    func rooms(token: String) async throws(ShelfAPIError) -> [ShelfRoom] { [] }

    func upload(_ upload: ShelfUpload, token: String) async throws(ShelfAPIError) -> ShelfUploadResponse {
        if !hasEnqueued {
            hasEnqueued = true
            _ = try? await outbox.enqueue(image, note: nil, sourceURL: nil, roomID: nil)
        }
        return ShelfUploadResponse(itemId: UUID(), duplicate: false, roomLinked: false)
    }

    func library(offset: Int, token: String) async throws(ShelfAPIError) -> LibraryPage {
        throw .network
    }

    func updateNote(itemID: UUID, note: String?, token: String) async throws(ShelfAPIError) -> LibraryItem {
        throw .network
    }

    func deleteItems(_ ids: [UUID], token: String) async throws(ShelfAPIError) -> LibraryCount {
        throw .network
    }

    func addItems(_ ids: [UUID], toRoom roomID: UUID, token: String) async throws(ShelfAPIError) -> LibraryCount {
        throw .network
    }

    func taste(token: String) async throws(ShelfAPIError) -> TasteResponse {
        throw .network
    }

    func saveTasteTile(_ tile: TasteTile, value: JSONValue, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteVersion {
        throw .network
    }

    func decideTasteCard(id: String, decision: TasteDecision, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteDecisionResult {
        throw .network
    }

    func resetTasteTile(_ tile: TasteTile, token: String) async throws(ShelfAPIError) -> TasteTileReset {
        throw .network
    }

    func composeTaste(_ request: TasteComposeRequest, token: String) async throws(ShelfAPIError) -> TasteComposeResponse {
        throw .network
    }
}
