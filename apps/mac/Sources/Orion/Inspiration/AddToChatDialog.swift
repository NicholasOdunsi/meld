import OrionDesignSystem
import ShelfCore
import SwiftUI

struct AddToChatDialog: View {
    let ids: Set<UUID>
    @Bindable var model: InspirationModel

    @State private var rooms: [ShelfRoom] = []
    @State private var picked: ShelfRoom?
    @State private var isLoading = true

    var body: some View {
        OrionDialog(
            title: Text("Add to Chat"),
            actionTitle: "Add",
            canConfirm: picked != nil,
            onCancel: { model.dialog = nil },
            onConfirm: add
        ) {
            if isLoading {
                ProgressView().frame(maxWidth: .infinity)
            } else if rooms.isEmpty {
                Text("No chats yet.").foregroundStyle(.secondary)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        ForEach(Dictionary(grouping: rooms, by: \.projectName).sorted { $0.key < $1.key }, id: \.key) { project, chats in
                            Text(project).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                .padding(.top, OrionSpacing.xs)
                            ForEach(chats) { room in
                                Button {
                                    picked = room
                                } label: {
                                    HStack {
                                        Text(room.roomName)
                                        Spacer()
                                        if picked == room { Image(systemName: "checkmark") }
                                    }
                                    .padding(.horizontal, OrionSpacing.sm)
                                    .frame(minHeight: 32)
                                    .background(picked == room ? AnyShapeStyle(.fill.secondary) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 8))
                                    .contentShape(.rect)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }
                .frame(maxHeight: 260)
            }
        }
        .task {
            rooms = await model.store.rooms()
            isLoading = false
        }
    }

    private func add() {
        guard let room = picked else { return }
        model.dialog = nil
        Task {
            if await model.store.addToRoom(ids, room: room) {
                model.toast = String(localized: "Added \(ids.count) images to \(room.roomName) · \(room.projectName)")
                model.selection = []
            }
        }
    }
}
