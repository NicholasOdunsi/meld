import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

@MainActor
final class Flag {
    var value = false
}

@MainActor
struct LibraryStoreTests {
    let directory = URL.temporaryDirectory.appending(path: "store-\(UUID().uuidString)", directoryHint: .isDirectory)

    /// Parsed via the same ISO form LibraryDates uses, so encode → decode equality holds.
    static let createdAt = try! Date(
        "2026-11-09T14:02:00.123Z",
        strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)
    )

    func item(_ note: String? = nil, id: UUID = UUID()) -> LibraryItem {
        LibraryItem(id: id, width: 4, height: 3, mimeType: .png, note: note, sourceUrl: nil, createdAt: Self.createdAt,
                    description: nil, labelState: .pending, rooms: [], imageUrl: nil)
    }

    func store(_ client: FakeOrionClient, token: String? = "t") -> LibraryStore {
        LibraryStore(client: { client }, token: { token }, cache: LibraryCache(directory: directory))
    }

    @Test func reloadLoadsAPageAndCachesIt() async {
        let client = FakeOrionClient()
        let first = item()
        await client.setLibraryPages([.success(LibraryPage(items: [first], nextOffset: 100))])
        let store = store(client)
        await store.reload()
        #expect(store.items == [first])
        #expect(store.phase == .loaded)
        #expect(store.hasMore)
        #expect(LibraryCache(directory: directory).load() == [first])
    }

    @Test func loadMoreAppendsTheNextOffset() async {
        let client = FakeOrionClient()
        let (a, b) = (item(), item())
        await client.setLibraryPages([
            .success(LibraryPage(items: [a], nextOffset: 100)),
            .success(LibraryPage(items: [b], nextOffset: nil)),
        ])
        let store = store(client)
        await store.reload()
        await store.loadMore()
        #expect(store.items == [a, b])
        #expect(await client.libraryOffsets == [0, 100])
        #expect(!store.hasMore)
    }

    @Test func offlineFallsBackToTheCache() async throws {
        let cached = item("from cache")
        try LibraryCache(directory: directory).save([cached])
        let client = FakeOrionClient()
        await client.setLibraryPages([.failure(.network)])
        let store = store(client)
        await store.reload()
        #expect(store.phase == .offline)
        #expect(store.items == [cached])
        #expect(!store.canEdit)
    }

    @Test func noTokenNeedsConnect() async {
        let store = store(FakeOrionClient(), token: nil)
        await store.reload()
        #expect(store.phase == .needsConnect)
    }

    @Test func unauthorizedAsksToReconnect() async {
        let client = FakeOrionClient()
        await client.setLibraryPages([.failure(ShelfAPIError(code: .unauthorized, message: "x"))])
        let store = store(client)
        let asked = Flag()
        store.onUnauthorized = { asked.value = true }
        await store.reload()
        #expect(asked.value)
        #expect(store.phase == .needsConnect)
    }

    @Test func noteIsOptimisticAndRollsBackOnFailure() async {
        let client = FakeOrionClient()
        let original = item("old")
        await client.setLibraryPages([.success(LibraryPage(items: [original], nextOffset: nil))])
        await client.setNoteResult(.failure(.network))
        let store = store(client)
        await store.reload()
        let saved = await store.updateNote(original.id, to: "new")
        #expect(!saved)
        #expect(store.items.first?.note == "old")
        #expect(store.errorMessage != nil)
    }

    @Test func noteSuccessKeepsTheServerCopy() async {
        let client = FakeOrionClient()
        let original = item("old")
        var serverCopy = original
        serverCopy.note = "new"
        await client.setLibraryPages([.success(LibraryPage(items: [original], nextOffset: nil))])
        await client.setNoteResult(.success(serverCopy))
        let store = store(client)
        await store.reload()
        #expect(await store.updateNote(original.id, to: "  new  "))
        #expect(store.items.first?.note == "new")
    }

    @Test func deleteRemovesAndRestoresOnFailure() async {
        let client = FakeOrionClient()
        let (a, b) = (item(), item())
        await client.setLibraryPages([.success(LibraryPage(items: [a, b], nextOffset: nil))])
        await client.setDeleteResult(.failure(.network))
        let store = store(client)
        await store.reload()
        #expect(!(await store.delete([a.id])))
        #expect(store.items == [a, b])
        await client.setDeleteResult(.success(LibraryCount(count: 1)))
        #expect(await store.delete([a.id]))
        #expect(store.items == [b])
    }

    @Test func addToRoomTagsTheItems() async {
        let client = FakeOrionClient()
        let a = item()
        let room = ShelfRoom(roomId: UUID(), roomName: "Main", projectName: "Voxecore")
        await client.setLibraryPages([.success(LibraryPage(items: [a], nextOffset: nil))])
        await client.setAddResult(.success(LibraryCount(count: 1)))
        let store = store(client)
        await store.reload()
        #expect(await store.addToRoom([a.id], room: room))
        #expect(store.items.first?.rooms == [room])
    }
}
