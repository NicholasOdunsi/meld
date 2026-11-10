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

    @Test func opensAndClosesAPopover() async {
        let (model, _) = await model()
        model.open(.choice(.density))
        #expect(model.popover == .choice(.density))
        #expect(model.popover?.slot == .space)
        model.closePopover()
        #expect(model.popover == nil)
    }

    @Test func cannotOpenAnEditorWhileOfflineButCraftRulesStayReadable() async {
        let (model, _) = await model(editable: false)
        model.open(.choice(.motion))
        #expect(model.popover == nil)
        model.open(.craft)
        #expect(model.popover == .craft)
    }

    @Test func closingAPopoverDoesNotCloseThePreview() async {
        let (model, _) = await model()
        model.open(.choice(.motion))
        model.isPreviewing = true
        model.closePopover()
        #expect(model.popover == nil)
        #expect(model.isPreviewing)
    }

    @Test func hoveringAnOptionShowsItWithoutSavingIt() async {
        let (model, _) = await model()
        #expect(model.displayBoard?.density == .airy)
        model.hoveredOption = (.density, "dense")
        #expect(model.displayBoard?.density == .dense)
        #expect(model.store.board?.density == .airy)
        model.closePopover()
        #expect(model.displayBoard?.density == .airy)
    }
}
