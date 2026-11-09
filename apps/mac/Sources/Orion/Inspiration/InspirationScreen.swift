import AppKit
import OrionAppCore
import QuickLook
import ShelfCore
import SwiftUI

struct InspirationScreen: View {
    @Bindable var model: InspirationModel
    let appModel: AppModel
    let frame: FrameModel
    let reconnect: () -> Void

    @State private var columns: [[Int]] = []
    @State private var previewURL: URL?

    var body: some View {
        VStack(spacing: 0) {
            InspirationHeader(model: model)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            if model.store.phase == .offline {
                InspirationStateView.offlineBanner
            }
            HStack(spacing: 0) {
                content
                if let item = model.selectedItem {
                    Divider()
                    InspirationPanel(item: item, model: model, frame: frame)
                        .transition(.move(edge: .trailing).combined(with: .opacity))
                }
            }
            .animation(.snappy(duration: 0.2), value: model.isPanelOpen)
        }
        .task { await model.store.reload() }
        .onChange(of: appModel.isConnected) { _, connected in
            if connected { Task { await model.store.reload() } }
        }
        .onChange(of: model.store.errorMessage) { _, message in
            guard let message else { return }
            frame.errorMessage = message
            model.store.clearError()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await model.store.reload() }
        }
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(.leftArrow) { move(.left) }
        .onKeyPress(.rightArrow) { move(.right) }
        .onKeyPress(.upArrow) { move(.up) }
        .onKeyPress(.downArrow) { move(.down) }
        .onKeyPress(.space) {
            guard !model.isEditingNote, let item = model.selectedItem else { return .ignored }
            Task { previewURL = try? await model.thumbnails.fullImageFile(for: item) }
            return .handled
        }
        .quickLookPreview($previewURL)
        .onExitCommand { model.clearSelection() }
    }

    private func move(_ direction: WallDirection) -> KeyPress.Result {
        guard !model.isEditingNote else { return .ignored }
        model.move(direction, columns: columns)
        return .handled
    }

    @ViewBuilder
    private var content: some View {
        switch model.store.phase {
        case .idle where model.store.items.isEmpty, .loading where model.store.items.isEmpty:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .needsConnect where model.store.items.isEmpty:
            InspirationStateView(kind: .connecting, reconnect: reconnect)
        case .loaded where model.store.items.isEmpty && appModel.pendingCaptures.isEmpty:
            InspirationStateView(kind: .empty, reconnect: reconnect)
        default:
            InspirationWall(model: model, pending: appModel.pendingCaptures) { columns = $0 }
        }
    }
}
