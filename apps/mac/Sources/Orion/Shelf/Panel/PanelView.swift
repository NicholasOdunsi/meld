import ShelfCore
import SwiftUI

struct PanelView: View {
    @Environment(AppModel.self) private var appModel
    @State private var model = PanelModel()

    var body: some View {
        VStack(alignment: .leading, spacing: ShelfDesign.spacing) {
            if appModel.connection == .disconnected {
                ConnectView()
            } else {
                if let message = appModel.lastMessage {
                    MessageBannerView(message: message, dismiss: appModel.dismissMessage)
                }
                RoomPickerView(rooms: model.rooms, selection: $model.selectedRoomID)
                DropZoneView(onDrop: capture, onPaste: paste)
                if appModel.waitingCount > 0 {
                    WaitingRowView(count: appModel.waitingCount, retry: retry)
                }
                RecentThumbnailsView(recent: appModel.recent, open: openItem)
                Divider()
                PanelFooterView(openOrion: { appModel.showWindow?() }, quit: appModel.quit)
            }
        }
        .padding(ShelfDesign.spacing)
        .frame(width: ShelfDesign.panelWidth)
        .task(id: RoomListRefresh(connection: appModel.connection, panelOpenCount: appModel.panelOpenCount)) {
            await model.loadRooms(using: appModel)
        }
    }

    private func capture(_ images: [CapturedImage]) {
        Task { await model.capture(images, using: appModel) }
    }

    private func paste() {
        Task { await model.paste(using: appModel) }
    }

    private func retry() {
        Task { await appModel.retryNow() }
    }

    private func openItem(_ itemID: UUID) {
        appModel.openLibrary(itemID: itemID)
    }
}
