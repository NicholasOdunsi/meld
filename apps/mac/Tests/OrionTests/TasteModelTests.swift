import Foundation
import ShelfCore
import ShelfTestSupport
import Testing
@testable import Orion

@MainActor
struct TasteModelTests {
    func model(editable: Bool = true) async -> (TasteModel, FakeOrionClient) {
        let client = FakeOrionClient()
        if editable { await client.setTasteResults([.success(.ready(TasteFixtures.snapshot()))]) }
        let directory = URL.temporaryDirectory.appending(path: "tm-\(UUID().uuidString)")
        let store = TasteStore(client: { client }, token: { "t" }, cache: TasteCache(directory: directory))
        await store.reload()
        return (TasteModel(store: store), client)
    }

    @Test func opensAndClosesAPanel() async {
        let (model, _) = await model()
        model.open(.density)
        #expect(model.openTile == .density)
        model.closePanel()
        #expect(model.openTile == nil)
    }

    @Test func cannotOpenAPanelWhileOffline() async {
        let (model, _) = await model(editable: false)
        model.open(.density)
        #expect(model.openTile == nil)
    }

    @Test func sampleBoardIsTheBoardUntilACardIsPreviewed() async {
        let card = TasteCard(id: "c", tile: .density, op: "set", value: .string("dense"), reason: "r", evidenceItemIds: [])
        let client = FakeOrionClient()
        await client.setTasteResults([.success(.ready(TasteFixtures.snapshot(pending: [card])))])
        let store = TasteStore(client: { client }, token: { "t" }, cache: TasteCache(directory: URL.temporaryDirectory.appending(path: "tm-\(UUID().uuidString)")))
        await store.reload()
        let model = TasteModel(store: store)
        #expect(model.sampleBoard?.density == .airy)
        model.previewCardID = "c"
        #expect(model.sampleBoard?.density == .dense)
        #expect(store.board?.density == .airy)
    }
}
