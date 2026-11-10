import AppKit
import OrionAppCore
import OrionDesignSystem
import QuickLook
import ShelfCore
import SwiftUI

struct InspirationScreen: View {
    @Bindable var model: InspirationModel
    let appModel: AppModel
    let frame: FrameModel
    let reconnect: () -> Void

    @State private var previewURL: URL?

    var body: some View {
        VStack(spacing: 0) {
            InspirationHeader(model: model)
                .padding(.horizontal, 16)
                .padding(.top, FrameMetrics.overviewTopMargin)
                .padding(.bottom, 10)
            if model.store.phase == .offline {
                InspirationStateView.offlineBanner
            }
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
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
            guard !model.isEditingNote, let item = model.inspectedItem else { return .ignored }
            Task { previewURL = try? await model.thumbnails.fullImageFile(for: item) }
            return .handled
        }
        .onKeyPress(characters: ["a"], phases: .down) { press in
            guard press.modifiers == .command, !model.isEditingNote else { return .ignored }
            model.selectAll()
            return .handled
        }
        .quickLookPreview($previewURL)
        .onExitCommand { model.clearSelection() }
        .dropDestination(for: ShelfDropItem.self) { items, _ in
            let images = items.map(\.captured)
            guard !images.isEmpty else {
                model.toast = String(localized: "Only images can be saved to Inspiration.")
                return false
            }
            Task { await appModel.capture(images, note: nil, roomID: nil) }
            return true
        }
        .onPasteCommand(of: [.image, .fileURL]) { _ in
            Task { await appModel.captureClipboard() }
        }
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
        .overlay {
            if let dialog = model.dialog {
                ZStack {
                    Color.black.opacity(0.25).ignoresSafeArea().contentShape(.rect).onTapGesture {}
                    switch dialog {
                    case .useInProject(let ids): UseInProjectDialog(ids: ids, model: model, frame: frame)
                    case .delete(let ids): DeleteImagesDialog(ids: ids, model: model)
                    }
                }
                .transition(.opacity)
            }
        }
        .animation(.snappy(duration: 0.18), value: model.dialog)
    }

    private func move(_ direction: WallDirection) -> KeyPress.Result {
        guard !model.isEditingNote else { return .ignored }
        model.move(direction, columns: model.columns)
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
            InspirationWall(model: model, pending: appModel.pendingCaptures) { _ in }
        }
    }
}
