import ShelfCore
import SwiftUI

struct RoomPickerView: View {
    let rooms: [ShelfRoom]
    @Binding var selection: UUID?

    var body: some View {
        Picker("Also add to room", selection: $selection) {
            Text("Library only").tag(UUID?.none)
            ForEach(rooms) { room in
                Text("\(room.projectName) › \(room.roomName)").tag(Optional(room.roomId))
            }
        }
    }
}
