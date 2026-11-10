// TasteStoreTests.swift
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

@MainActor
struct TasteStoreTests {
    let directory = URL.temporaryDirectory.appending(path: "taste-\(UUID().uuidString)", directoryHint: .isDirectory)

    func store(_ client: FakeOrionClient, token: String? = "t") -> TasteStore {
        TasteStore(client: { client }, token: { token }, cache: TasteCache(directory: directory))
    }

    @Test func reloadLoadsAndCaches() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot()))])
        let store = store(client)
        await store.reload()
        #expect(store.phase == .loaded)
        #expect(store.board?.density == .airy)
        #expect(TasteCache(directory: directory).load() == TasteFixtures.snapshot())
    }

    @Test func noBoardYetIsLearning() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.learning)])
        let store = store(client)
        await store.reload()
        #expect(store.phase == .learning)
        #expect(!store.canEdit)
    }

    @Test func offlineFallsBackToTheCacheAndBlocksEdits() async throws {
        try TasteCache(directory: directory).save(TasteFixtures.snapshot(version: 7))
        let client = FakeOrionClient() // no scripted result → network error
        let store = store(client)
        await store.reload()
        #expect(store.phase == .offline)
        #expect(store.snapshot?.version == 7)
        #expect(!store.canEdit)
        #expect(await store.save(.density, to: .string("dense")) == false)
        #expect(await client.tilesSaved.isEmpty)
    }

    @Test func saveAppliesAtOnceAndKeepsTheNewVersion() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot()))])
        await client.setTileResult(.success(TasteVersion(version: 4)))
        let store = store(client)
        await store.reload()
        #expect(await store.save(.density, to: .string("dense")))
        #expect(store.board?.density == .dense)
        #expect(store.snapshot?.version == 4)
        #expect(await client.tilesSaved.first?.2 == 3)
    }

    @Test func aFailedSaveIsUndone() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot()))])
        await client.setTileResult(.failure(ShelfAPIError(code: .unavailable, message: "x")))
        let store = store(client)
        await store.reload()
        #expect(await store.save(.density, to: .string("dense")) == false)
        #expect(store.board?.density == .airy)
        #expect(store.errorMessage != nil)
    }

    @Test func aConflictReloadsAndSaysSo() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot())), .success(.ready(TasteFixtures.snapshot(version: 9)))])
        await client.setTileResult(.failure(ShelfAPIError(code: .conflict, message: "")))
        let store = store(client)
        await store.reload()
        #expect(await store.save(.density, to: .string("dense")) == false)
        #expect(store.snapshot?.version == 9)
        #expect(store.errorMessage == "Your taste changed in the meantime. Try that again.")
    }

    @Test func invalidValuesNeverReachTheServer() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot()))])
        let store = store(client)
        await store.reload()
        #expect(await store.save(.density, to: .string("roomy")) == false)
        #expect(await client.tilesSaved.isEmpty)
    }

    @Test func decideRemovesTheCardAndReloads() async {
        let card = TasteCard(id: "c1", tile: .density, op: "set", value: .string("dense"), reason: "r", evidenceItemIds: [])
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot(pending: [card]))), .success(.ready(TasteFixtures.snapshot(version: 4)))])
        let store = store(client)
        await store.reload()
        #expect(await store.decide(card, .kept))
        #expect(store.snapshot?.pending.isEmpty == true)
        #expect(await client.decisions.first?.2 == 3)
    }

    @Test func previewAppliesOneCardWithoutSaving() async {
        let add = TasteCard(id: "a", tile: .layoutHabits, op: "add", value: .string("Sidebar plus one column"), reason: "r", evidenceItemIds: [])
        let set = TasteCard(id: "s", tile: .density, op: "set", value: .string("dense"), reason: "r", evidenceItemIds: [])
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot(pending: [add, set])))])
        let store = store(client)
        await store.reload()
        #expect(store.preview(add)?.layoutHabits == ["Single column forms", "Sidebar plus one column"])
        #expect(store.preview(set)?.density == .dense)
        #expect(store.preview(nil) == store.board)
        #expect(store.board?.density == .airy)
    }

    @Test func appleRulesToggleRoundTrips() async {
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot()))])
        await client.setAppleResult(.success(TasteAppleRules(enabled: false)))
        let store = store(client)
        await store.reload()
        #expect(await store.setAppleRules(false))
        #expect(store.snapshot?.appleRules == false)
    }
}
