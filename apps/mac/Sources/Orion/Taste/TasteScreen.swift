import AppKit
import OrionDesignSystem
import ShelfCore
import SwiftUI
import UniformTypeIdentifiers

struct TasteScreen: View {
    @Bindable var model: TasteModel
    let appModel: AppModel
    let frame: FrameModel
    let reconnect: () -> Void

    @State private var draft = ComposerDraft()
    @State private var pastedImageCount = 0

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                TasteHeader(model: model, board: model.store.board)
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
            if model.isPreviewing, let board = model.sampleBoard ?? model.store.board {
                TastePreviewOverlay(board: board) { model.isPreviewing = false }
                    .transition(.opacity)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if showsComposer {
                TasteComposerView(model: model, appModel: appModel, draft: $draft)
            }
        }
        .dropDestination(for: URL.self) { urls, _ in
            Task { await addDroppedFiles(urls) }
            return true
        }
        .dropDestination(for: String.self) { strings, _ in
            addDroppedText(strings)
            return !strings.isEmpty
        }
        .onPasteCommand(of: [.fileURL, .image, .url, .plainText]) { _ in
            pasteFromClipboard()
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
        .onExitCommand {
            if model.isPreviewing { model.isPreviewing = false } else { model.closePanel() }
        }
        .animation(.snappy(duration: 0.2), value: model.openSlot)
        .animation(.easeOut(duration: 0.15), value: model.isPreviewing)
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

    private var showsComposer: Bool {
        model.store.snapshot != nil && model.store.phase != .learning
    }

    @ViewBuilder
    private var content: some View {
        switch model.store.phase {
        case .idle where model.store.snapshot == nil, .loading where model.store.snapshot == nil:
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        case .needsConnect where model.store.snapshot == nil:
            InspirationStateView(kind: .connecting, reconnect: reconnect)
        case .learning where model.store.snapshot == nil:
            TasteLearningBoard()
        case .offline where model.store.snapshot == nil:
            ContentUnavailableView("Taste isn't available right now", systemImage: "exclamationmark.triangle")
        default:
            if let board = model.sampleBoard {
                HStack(alignment: .top, spacing: 0) {
                    ScrollView {
                        TasteBoardGrid(model: model, board: board)
                            .padding(.horizontal, OrionSpacing.md)
                            .padding(.bottom, OrionSpacing.xl)
                    }
                    if let slot = model.openSlot {
                        TasteEditPanel(slot: slot, model: model)
                            .frame(width: 360)
                            .background(.regularMaterial)
                            .transition(.move(edge: .trailing).combined(with: .opacity))
                    }
                }
            }
        }
    }

    private func addDroppedFiles(_ urls: [URL]) async {
        for url in urls {
            if let loaded = await TasteComposerView.loadFile(at: url) {
                _ = draft.addFile(name: loaded.name, data: loaded.data)
            }
        }
    }

    private func addDroppedText(_ strings: [String]) {
        for string in strings {
            let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            if let url = URL(string: trimmed), draft.addURL(url) == .added { continue }
            if draft.words.isEmpty {
                draft.words = trimmed
            } else {
                draft.words += " " + trimmed
            }
            if draft.words.contains("http") { draft.extractLinks() }
        }
    }

    private func pasteFromClipboard() {
        let pasteboard = NSPasteboard.general
        let images = PasteboardReader().images(from: pasteboard)
        for image in images {
            pastedImageCount += 1
            _ = draft.addFile(name: "pasted-image-\(pastedImageCount).png", data: image.data)
        }
        if let urls = pasteboard.readObjects(forClasses: [NSURL.self]) as? [URL] {
            for url in urls {
                if url.isFileURL {
                    Task {
                        if let loaded = await TasteComposerView.loadFile(at: url) {
                            _ = draft.addFile(name: loaded.name, data: loaded.data)
                        }
                    }
                } else {
                    _ = draft.addURL(url)
                }
            }
        }
        if let string = pasteboard.string(forType: .string), !string.isEmpty {
            addDroppedText([string])
        }
    }
}
