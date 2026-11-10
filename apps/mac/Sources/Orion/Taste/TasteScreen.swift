import AppKit
import OrionDesignSystem
import ShelfCore
import SwiftUI

struct TasteScreen: View {
    @Bindable var model: TasteModel
    let appModel: AppModel
    let frame: FrameModel
    let reconnect: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Text("Taste")
                .font(.title2.weight(.bold))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, OrionSpacing.md)
                .padding(.top, FrameMetrics.overviewTopMargin)
                .padding(.bottom, OrionSpacing.sm)
            if model.store.phase == .offline {
                Label("Offline. You can look, but not change anything.", systemImage: "wifi.slash")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, OrionSpacing.md)
                    .padding(.bottom, OrionSpacing.xs)
            }
            content.frame(maxWidth: .infinity, maxHeight: .infinity)
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
        .onExitCommand { model.closePanel() }
        .animation(.snappy(duration: 0.2), value: model.openTile)
        .overlay(alignment: .bottom) {
            if let toast = model.toast {
                Text(toast)
                    .padding(.horizontal, OrionSpacing.md)
                    .padding(.vertical, OrionSpacing.sm)
                    .glassEffect(.regular, in: .capsule)
                    .padding(16)
            }
        }
        .task(id: model.toast) {
            guard model.toast != nil else { return }
            try? await Task.sleep(for: .seconds(2.5))
            model.toast = nil
        }
    }

    @ViewBuilder
    private var content: some View {
        switch model.store.phase {
        case .idle where model.store.snapshot == nil, .loading where model.store.snapshot == nil:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .needsConnect where model.store.snapshot == nil:
            InspirationStateView(kind: .connecting, reconnect: reconnect)
        case .learning where model.store.snapshot == nil:
            ContentUnavailableView(
                "Orion is still learning",
                systemImage: "sparkles",
                description: Text("Save a few more images to Inspiration and Orion will draw your taste.")
            )
        default:
            if let board = model.sampleBoard {
                HStack(alignment: .top, spacing: OrionSpacing.lg) {
                    ZStack {
                        if let tile = model.openTile {
                            TasteEditPanel(tile: tile, model: model)
                                .transition(.move(edge: .trailing).combined(with: .opacity))
                        } else {
                            TasteChapterList(model: model, board: board)
                                .transition(.move(edge: .leading).combined(with: .opacity))
                        }
                    }
                    .frame(minWidth: 380, maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    TasteSampleView(style: TasteSampleStyle(board: board))
                        .frame(width: 320)
                        .frame(maxHeight: .infinity, alignment: .top)
                        .padding(.trailing, OrionSpacing.md)
                }
                .padding(.leading, OrionSpacing.md)
            }
        }
    }
}
