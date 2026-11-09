import Foundation
import OrionAppCore
import ShelfCore
import ShelfTestSupport
import Testing
@testable import Orion

@MainActor
struct InspirationModelTests {
    let ids = (0..<4).map { _ in UUID() }

    func model() async -> InspirationModel {
        let client = FakeOrionClient()
        let items = ids.map {
            LibraryItem(id: $0, width: 1, height: 1, mimeType: .png, note: nil, sourceUrl: nil, createdAt: .now,
                        description: nil, labelState: .pending, rooms: [], imageUrl: nil)
        }
        await client.setLibraryPages([.success(LibraryPage(items: items, nextOffset: nil))])
        let directory = URL.temporaryDirectory.appending(path: "insp-\(UUID().uuidString)")
        let store = LibraryStore(client: { client }, token: { "t" }, cache: LibraryCache(directory: directory))
        await store.reload()
        let defaults = UserDefaults(suiteName: "insp-\(UUID().uuidString)")!
        return InspirationModel(store: store, thumbnails: ThumbnailCache(directory: directory), defaults: defaults)
    }

    @Test func plainClickSelectsOneAndOpensThePanel() async {
        let model = await model()
        model.click(ids[1], command: false, shift: false)
        #expect(model.selection == [ids[1]])
        #expect(model.isPanelOpen)
        model.click(ids[1], command: false, shift: false)
        #expect(model.selection.isEmpty)
    }

    @Test func commandTogglesAndShiftSelectsARange() async {
        let model = await model()
        model.click(ids[0], command: false, shift: false)
        model.click(ids[2], command: true, shift: false)
        #expect(model.selection == [ids[0], ids[2]])
        #expect(!model.isPanelOpen)
        model.click(ids[3], command: false, shift: true)
        #expect(model.selection == [ids[2], ids[3]])
    }

    @Test func arrowsMoveASingleSelection() async {
        let model = await model()
        model.click(ids[0], command: false, shift: false)
        model.move(.right, columns: [[0, 2], [1, 3]])
        #expect(model.selection == [ids[1]])
        model.move(.down, columns: [[0, 2], [1, 3]])
        #expect(model.selection == [ids[3]])
    }

    @Test func tileStepPersists() async {
        let model = await model()
        model.biggerTiles()
        #expect(model.tileStep.index == TileStep.defaultIndex + 1)
    }
}
