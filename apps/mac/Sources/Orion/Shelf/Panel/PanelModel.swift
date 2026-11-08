import Foundation
import Observation
import ShelfCore

/// Panel-only state: the room for the next save, and the room list.
@MainActor
@Observable
final class PanelModel {
    var selectedRoomID: UUID?
    private(set) var rooms: [ShelfRoom] = []

    func loadRooms(using appModel: AppModel) async {
        rooms = await appModel.loadRooms()
        if let selectedRoomID, !rooms.contains(where: { $0.roomId == selectedRoomID }) {
            self.selectedRoomID = nil
        }
    }

    func capture(_ images: [CapturedImage], using appModel: AppModel) async {
        await appModel.capture(images, note: nil, roomID: selectedRoomID)
    }

    func paste(using appModel: AppModel) async {
        await appModel.captureClipboard(roomID: selectedRoomID)
    }
}
