import AppKit
import OrionAppCore
import ShelfCore
import SwiftUI

struct InspirationScreen: View {
    @Bindable var model: InspirationModel
    let appModel: AppModel
    let frame: FrameModel
    let reconnect: () -> Void

    @State private var columns: [[Int]] = []

    var body: some View {
        VStack(spacing: 0) {
            InspirationHeader(model: model)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
            if model.store.phase == .offline {
                InspirationStateView.offlineBanner
            }
            content
        }
        .task { await model.store.reload() }
        .onChange(of: appModel.isConnected) { _, connected in
            if connected { Task { await model.store.reload() } }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            Task { await model.store.reload() }
        }
        .focusable()
        .focusEffectDisabled()
        .onKeyPress(.leftArrow) { model.move(.left, columns: columns); return .handled }
        .onKeyPress(.rightArrow) { model.move(.right, columns: columns); return .handled }
        .onKeyPress(.upArrow) { model.move(.up, columns: columns); return .handled }
        .onKeyPress(.downArrow) { model.move(.down, columns: columns); return .handled }
        .onExitCommand { model.clearSelection() }
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
