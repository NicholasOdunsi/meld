import AppKit
import OrionDesignSystem
import ShelfCore
import SwiftUI
import UniformTypeIdentifiers

/// Docked composer: words, files and links → Read it → pending cards.
struct TasteComposerView: View {
    @Bindable var model: TasteModel
    let appModel: AppModel
    @Binding var draft: ComposerDraft

    @State private var isImporting = false

    private var composerEnabled: Bool { model.store.snapshot?.composerEnabled != false }
    private var isReading: Bool {
        if case .reading = model.store.composeState { return true }
        return false
    }
    private var skipped: [TasteComposeSkipped] {
        switch model.store.composeState {
        case .done(let skipped), .noResult(let skipped): skipped
        default: []
        }
    }

    var body: some View {
        Group {
            if composerEnabled {
                enabledBody
            } else {
                Text("Add a DeepSeek key to let Orion read things. You can still edit everything by hand.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, OrionSpacing.md)
                    .padding(.vertical, OrionSpacing.sm)
            }
        }
        .fileImporter(
            isPresented: $isImporting,
            allowedContentTypes: Self.allowedTypes,
            allowsMultipleSelection: true
        ) { result in
            guard case .success(let urls) = result else { return }
            Task { await importFiles(urls) }
        }
    }

    private var enabledBody: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.xs) {
            VStack(alignment: .leading, spacing: OrionSpacing.sm) {
                ComposerAttachments(draft: $draft, skipped: skipped)

                HStack(alignment: .bottom, spacing: OrionSpacing.sm) {
                    TextField(
                        "Tell Orion what you like, or drop files and links here…",
                        text: $draft.words,
                        axis: .vertical
                    )
                    .textFieldStyle(.plain)
                    .lineLimit(1...6)
                    .onChange(of: draft.words) { _, newValue in
                        if newValue.contains("http") { draft.extractLinks() }
                    }

                    if draft.words.count > 3500 {
                        Text("\(draft.words.count)/\(ComposerDraft.maxWords)")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(draft.words.count > ComposerDraft.maxWords ? .red : .secondary)
                    }
                }

                HStack(spacing: OrionSpacing.sm) {
                    Button {
                        isImporting = true
                    } label: {
                        Label("Attach", systemImage: "plus")
                    }
                    .buttonStyle(OrionButtonStyle(.secondary))
                    .disabled(!model.store.canEdit || isReading)

                    if !draft.imageFiles.isEmpty {
                        Toggle("Also save images to Inspiration", isOn: $draft.saveImagesToInspiration)
                            .toggleStyle(.checkbox)
                            .font(.caption)
                            .help("When on, attached images are also saved to Inspiration after a successful read.")
                    }

                    Spacer(minLength: OrionSpacing.sm)

                    Button {
                        Task { await readIt() }
                    } label: {
                        if isReading {
                            HStack(spacing: OrionSpacing.xxs) {
                                ProgressView().controlSize(.small)
                                Text("Reading…")
                            }
                        } else {
                            Text("Read it ↑")
                        }
                    }
                    .buttonStyle(OrionButtonStyle(.primary))
                    .disabled(!draft.canRead || !model.store.canEdit || isReading)
                }
            }
            .padding(OrionSpacing.md)
            .background(.regularMaterial, in: .rect(cornerRadius: OrionRadius.large, style: .continuous))

            statusLine
        }
        .padding(.horizontal, OrionSpacing.md)
        .padding(.bottom, OrionSpacing.sm)
    }

    @ViewBuilder
    private var statusLine: some View {
        switch model.store.composeState {
        case .failed(let message):
            Text(message)
                .font(.caption)
                .foregroundStyle(.red.opacity(0.85))
        case .noResult:
            Text("Orion couldn't find anything usable in that. Try adding a few words about what you like.")
                .font(.caption)
                .foregroundStyle(.secondary)
        case .done(let skipped) where !skipped.isEmpty:
            Text("Couldn't read: \(skipped.map(\.name).joined(separator: ", "))")
                .font(.caption)
                .foregroundStyle(.secondary)
        default:
            EmptyView()
        }
    }

    private func readIt() async {
        let saveImages = draft.saveImagesToInspiration
        let images = draft.imageFiles
        let request = draft.request(replyTo: draft.replyTargets(pending: model.store.pendingCards), tile: nil)
        guard await model.store.compose(request) else { return }
        if saveImages, !images.isEmpty {
            let captured = images.map { CapturedImage(data: $0.data, sourceURL: nil) }
            await appModel.capture(captured, note: nil, roomID: nil)
        }
        draft = ComposerDraft()
    }

    private func importFiles(_ urls: [URL]) async {
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let name = url.lastPathComponent
            let data: Data?
            do {
                data = try await Task.detached { try Data(contentsOf: url) }.value
            } catch {
                data = nil
            }
            guard let data else { continue }
            _ = draft.addFile(name: name, data: data)
        }
    }

    private static var allowedTypes: [UTType] {
        var types: [UTType] = [.pdf, .plainText, .png, .jpeg, .webP, .text]
        if let docx = UTType(filenameExtension: "docx") { types.append(docx) }
        return types
    }
}

extension TasteComposerView {
    /// Adds dropped or pasted file URLs into the draft off the main actor.
    static func loadFile(at url: URL) async -> (name: String, data: Data)? {
        let name = url.lastPathComponent
        do {
            let data = try await Task.detached { try Data(contentsOf: url) }.value
            return (name, data)
        } catch {
            return nil
        }
    }
}
