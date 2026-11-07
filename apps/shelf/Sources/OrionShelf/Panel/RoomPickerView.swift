import ShelfCore
import SwiftUI

struct RoomPickerView: View {
    let rooms: [ShelfRoom]
    @Binding var selection: UUID?

    var body: some View {
        // The menu's own text ("Library only" / "Project › Room") says where the
        // next save goes, so the visible label is hidden; VoiceOver still reads it.
        Picker("Save to", selection: $selection) {
            Text("Library only").tag(UUID?.none)
            ForEach(rooms) { room in
                Text("\(room.projectName) › \(room.roomName)").tag(Optional(room.roomId))
            }
        }
        .labelsHidden()
    }
}
