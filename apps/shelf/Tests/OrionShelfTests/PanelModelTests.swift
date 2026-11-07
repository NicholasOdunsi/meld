import Foundation
import ShelfCore
import ShelfTestSupport
import Testing
@testable import OrionShelf

@MainActor
struct PanelModelTests {
    @Test func loadsRoomsAndDropsAStaleSelection() async {
        let room = ShelfRoom(roomId: UUID(), roomName: "Login", projectName: "App")
        let model = TestDependencies(client: FakeOrionClient(roomsResult: .success([room]))).makeModel()
        let panel = PanelModel()
        panel.selectedRoomID = UUID()

        await panel.loadRooms(using: model)

        #expect(panel.rooms == [room])
        #expect(panel.selectedRoomID == nil)
    }

    @Test func savingUsesTheNoteAndRoomOnceThenClearsTheNote() async {
        let room = UUID()
        let deps = TestDependencies(client: FakeOrionClient(uploadResults: [.success(ShelfUploadResponse(itemId: UUID(), duplicate: false, roomLinked: true))]))
        let model = deps.makeModel()
        let panel = PanelModel()
        panel.note = "  love this  "
        panel.selectedRoomID = room

        await panel.capture([CapturedImage(data: TestImages.encoded(width: 4, height: 4, as: .png), sourceURL: nil)], using: model)
        await model.retryNow()

        #expect(panel.note.isEmpty)
        let sent = await deps.client.uploads
        #expect(sent.first?.note == "love this")
        #expect(sent.first?.roomID == room)
    }
}
