import Foundation
import ShelfCore
import ShelfTestSupport
import Testing
@testable import Orion

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

    @Test func everyPanelOpenAsksForAFreshRoomList() {
        let model = TestDependencies(client: FakeOrionClient()).makeModel()
        let atLaunch = RoomListRefresh(connection: model.connection, panelOpenCount: model.panelOpenCount)

        model.panelWillOpen()
        let afterFirstOpen = RoomListRefresh(connection: model.connection, panelOpenCount: model.panelOpenCount)
        model.panelWillOpen()
        let afterSecondOpen = RoomListRefresh(connection: model.connection, panelOpenCount: model.panelOpenCount)

        // The panel view stays alive for the whole app session, so a room made
        // after launch only appears if each open changes the refresh key.
        #expect(afterFirstOpen != atLaunch)
        #expect(afterSecondOpen != afterFirstOpen)
    }

    @Test func savingSendsTheChosenRoomWithoutANote() async {
        let room = UUID()
        let deps = TestDependencies(client: FakeOrionClient(uploadResults: [.success(ShelfUploadResponse(itemId: UUID(), duplicate: false, roomLinked: true))]))
        let model = deps.makeModel()
        let panel = PanelModel()
        panel.selectedRoomID = room

        await panel.capture([CapturedImage(data: TestImages.encoded(width: 4, height: 4, as: .png), sourceURL: nil)], using: model)
        await model.retryNow()

        let sent = await deps.client.uploads
        #expect(sent.first?.note == nil)
        #expect(sent.first?.roomID == room)
    }
}
