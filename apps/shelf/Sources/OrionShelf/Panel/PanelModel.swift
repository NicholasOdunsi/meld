import Foundation
import Observation
import ShelfCore

/// Panel-only state: the note and room for the next save, and the room list.
@MainActor
@Observable
final class PanelModel {
    var note = ""
    var selectedRoomID: UUID?
    private(set) var rooms: [ShelfRoom] = []

    func loadRooms(using appModel: AppModel) async {
        rooms = await appModel.loadRooms()
        if let selectedRoomID, !rooms.contains(where: { $0.roomId == selectedRoomID }) {
            self.selectedRoomID = nil
        }
    }

    func capture(_ images: [CapturedImage], using appModel: AppModel) async {
        await appModel.capture(images, note: takeNote(), roomID: selectedRoomID)
    }

    func paste(using appModel: AppModel) async {
        await appModel.captureClipboard(note: takeNote(), roomID: selectedRoomID)
    }

    /// The note applies to the next save only (spec B1), so it clears here.
    private func takeNote() -> String? {
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        note = ""
        return trimmed.isEmpty ? nil : String(trimmed.prefix(Limits.noteMax))
    }
}
