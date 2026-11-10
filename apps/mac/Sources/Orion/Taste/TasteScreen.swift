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
        .onExitCommand { model.closePanel() }
        .animation(.snappy(duration: 0.2), value: model.openSlot)
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
            ContentUnavailableView(
                "Orion is still learning",
                systemImage: "sparkles",
                description: Text("Save a few more images to Inspiration and Orion will draw your taste.")
            )
        case .offline where model.store.snapshot == nil:
            ContentUnavailableView(
                "Taste isn't available right now",
                systemImage: "exclamationmark.triangle"
            )
        default:
            if let board = model.sampleBoard {
                HStack(alignment: .top, spacing: OrionSpacing.lg) {
                    VStack(alignment: .leading, spacing: OrionSpacing.md) {
                        if !model.store.pendingCards.isEmpty {
                            TasteCardTray(model: model, cards: model.store.pendingCards)
                                .padding(.trailing, OrionSpacing.md)
                        }
                        ZStack {
                            if model.openSlot != nil {
                                EmptyView()
                            } else {
                                TasteChapterList(model: model, board: board)
                                    .transition(.move(edge: .leading).combined(with: .opacity))
                            }
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    }
                    .frame(minWidth: 380, maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    EmptyView()
                        .frame(width: 320)
                        .frame(maxHeight: .infinity, alignment: .top)
                        .padding(.trailing, OrionSpacing.md)
                }
                .padding(.leading, OrionSpacing.md)
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
