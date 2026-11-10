// TasteComposeTests.swift
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

@MainActor
struct TasteComposeTests {
    let directory = URL.temporaryDirectory.appending(path: "tc-\(UUID().uuidString)", directoryHint: .isDirectory)
    func card(_ id: String, tile: TasteTile = .spacing, value: JSONValue = .string("generous")) -> TasteCard {
        TasteCard(id: id, tile: tile, op: "set", value: value, reason: "r", evidenceItemIds: [],
                  origin: "composer", source: TasteCardSource(kind: "file", name: "Brand.pdf", locator: "page 3"))
    }
    func loaded(_ client: FakeOrionClient, pending: [TasteCard] = []) async -> TasteStore {
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot(pending: pending)))])
        let store = TasteStore(client: { client }, token: { "t" }, cache: TasteCache(directory: directory))
        await store.reload()
        return store
    }

    @Test func oldPayloadsWithoutSourceStillDecode() throws {
        let json = #"{"id":"1","tile":"density","op":"set","value":"airy","reason":"r","evidenceItemIds":[]}"#
        let decoded = try JSONDecoder().decode(TasteCard.self, from: Data(json.utf8))
        #expect(decoded.source == nil)
        #expect(decoded.origin == nil)
    }

    @Test func requestIsEmptyOnlyWhenNothingWasGiven() {
        #expect(TasteComposeRequest().isEmpty)
        #expect(!TasteComposeRequest(words: "calm").isEmpty)
        #expect(TasteComposeRequest(words: "   ").isEmpty)
    }

    @Test func composeReloadsSoTheNewCardsAppear() async {
        let client = FakeOrionClient()
        let added = card("n1")
        let store = await loaded(client)
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot(pending: [added])))])
        await client.setComposeResult(.success(TasteComposeResponse(cards: [added], skipped: [])))
        #expect(await store.compose(TasteComposeRequest(words: "calm")))
        #expect(store.pendingCards.map(\.id) == ["n1"])
        #expect(store.composeState == .done(skipped: []))
    }

    @Test func noCardsIsAGentleNoResult() async {
        let client = FakeOrionClient()
        let store = await loaded(client)
        await client.setComposeResult(.success(TasteComposeResponse(cards: [], skipped: [TasteComposeSkipped(name: "a.pdf", reason: "Couldn't read this file")])))
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot()))])
        #expect(await store.compose(TasteComposeRequest(words: "x")) == false)
        #expect(store.composeState == .noResult(skipped: [TasteComposeSkipped(name: "a.pdf", reason: "Couldn't read this file")]))
    }

    @Test func failuresBecomeReadableMessages() async {
        let client = FakeOrionClient()
        let store = await loaded(client)
        await client.setComposeResult(.failure(ShelfAPIError(code: .rateLimited, message: "slow down")))
        #expect(await store.compose(TasteComposeRequest(words: "x")) == false)
        #expect(store.composeState == .failed("You've asked Orion to read a lot just now. Try again in a few minutes."))
        await client.setComposeResult(.failure(ShelfAPIError(code: .unavailable, message: "x")))
        _ = await store.compose(TasteComposeRequest(words: "x"))
        #expect(store.composeState == .failed("Orion couldn't read that right now. Try again."))
    }

    @Test func emptyRequestsNeverReachTheServer() async {
        let client = FakeOrionClient()
        let store = await loaded(client)
        #expect(await store.compose(TasteComposeRequest()) == false)
        #expect(await client.composeRequests.isEmpty)
    }

    @Test func keepAllDecidesEveryCardThenReloadsOnce() async {
        let a = card("a"), b = card("b", tile: .density, value: .string("airy"))
        let client = FakeOrionClient()
        let store = await loaded(client, pending: [a, b])
        // One reload per Keep (version bumps); script a ready result for each card.
        await client.setTasteResults([
            .success(.ready(TasteFixtures.snapshot(version: 4))),
            .success(.ready(TasteFixtures.snapshot(version: 5))),
        ])
        await store.keepAll()
        #expect(await client.decisions.map(\.0) == ["a", "b"])
        #expect(store.pendingCards.isEmpty)
        #expect(store.snapshot?.version == 5)
    }
}
