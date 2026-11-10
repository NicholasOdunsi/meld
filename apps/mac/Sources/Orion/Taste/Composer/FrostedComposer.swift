import AppKit
import OrionDesignSystem
import ShelfCore
import SwiftUI
import UniformTypeIdentifiers

/// The floating, frosted-ice composer: words, files and links in, suggestions on the board out.
struct FrostedComposer: View {
    @Bindable var model: TasteModel
    let appModel: AppModel
    @Binding var draft: ComposerDraft
    let availableWidth: CGFloat

    @FocusState private var isFocused: Bool
    @State private var isExpanded = false
    @State private var isImporting = false
    @State private var linkHint = false

    private var composerEnabled: Bool { model.store.snapshot?.composerEnabled != false }
    private var isReading: Bool {
        if case .reading = model.store.composeState { return true }
        return false
    }
    private var hasContent: Bool { !draft.words.isEmpty || !draft.files.isEmpty || !draft.urls.isEmpty }
    private var phase: ComposerPhase { .of(isExpanded: isExpanded, hasContent: hasContent, isReading: isReading) }
    private var skipped: [TasteComposeSkipped] {
        switch model.store.composeState {
        case .done(let skipped), .noResult(let skipped): skipped
        default: []
        }
    }
    private var sendIsBright: Bool {
        ComposerSend.isBright(canSend: draft.canRead, canEdit: model.store.canEdit, isReading: isReading)
    }

    var body: some View {
        Group {
            if !composerEnabled {
                disabledPill
            } else {
                switch phase {
                case .resting: restingPill
                case .open: openPanel
                case .reading: readingPanel
                }
            }
        }
        .frame(width: ComposerMetrics.width(for: phase, available: availableWidth))
        .iceGlass(cornerRadius: ComposerMetrics.cornerRadius(for: phase))
        .foregroundStyle(.white)
        .animation(.snappy(duration: 0.2), value: phase)
        .fileImporter(isPresented: $isImporting, allowedContentTypes: Self.allowedTypes, allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            Task { await importFiles(urls) }
        }
    }

    // MARK: Phases

    private var restingPill: some View {
        HStack(spacing: OrionSpacing.sm) {
            plusMenu
            Text("Tell Orion something…")
                .font(.system(size: 13, weight: .light))
                .foregroundStyle(.white.opacity(0.6))
                .frame(maxWidth: .infinity, alignment: .leading)
            ComposerSendButton(size: ComposerMetrics.sendSize(for: .resting), isBright: false, action: {})
        }
        .padding(.leading, OrionSpacing.md)
        .padding(.trailing, OrionSpacing.sm)
        .padding(.vertical, 11)
        .contentShape(.rect)
        .onTapGesture { isExpanded = true }
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isButton)
    }

    private var openPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            title(isSweeping: false)
            ComposerAttachments(draft: $draft, skipped: skipped)
                .padding(.top, OrionSpacing.sm)
            TextField("Tell Orion what you like, or drop files here…", text: $draft.words, axis: .vertical)
                .textFieldStyle(.plain)
                .font(.system(size: 15, weight: .light))
                .lineLimit(1...6)
                .focused($isFocused)
                .padding(.top, OrionSpacing.sm + 2)
                .onChange(of: draft.words) { _, newValue in
                    if newValue.contains("http") { draft.extractLinks() }
                }
                .onKeyPress(keys: [.return]) { press in
                    guard !press.modifiers.contains(.shift) else { return .ignored }
                    guard sendIsBright else { return .handled }
                    Task { await send() }
                    return .handled
                }
                .onKeyPress(keys: [.escape]) { _ in
                    if !hasContent { isExpanded = false }
                    isFocused = false
                    return .handled
                }
            if draft.words.count > 3500 {
                Text("\(draft.words.count)/\(ComposerDraft.maxWords)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(draft.words.count > ComposerDraft.maxWords ? Color.red : Color.white.opacity(0.6))
                    .padding(.top, OrionSpacing.xxs)
            }
            if linkHint {
                Text("Copy a link, then tap + Link, or paste it into the box.")
                    .font(.caption).foregroundStyle(.white.opacity(0.7)).padding(.top, OrionSpacing.xxs)
            }
            statusLine
            HStack(spacing: OrionSpacing.xs) {
                plusMenu
                if !draft.imageFiles.isEmpty {
                    Toggle("Also save images to Inspiration", isOn: $draft.saveImagesToInspiration)
                        .toggleStyle(.checkbox)
                        .font(.caption)
                        .help("When on, attached images are also saved to Inspiration after a successful read.")
                }
                Spacer(minLength: OrionSpacing.sm)
                ComposerSendButton(size: ComposerMetrics.sendSize(for: .open), isBright: sendIsBright) {
                    Task { await send() }
                }
            }
            .padding(.top, OrionSpacing.md)
        }
        .padding(.horizontal, 24)
        .padding(.top, 14)
        .padding(.bottom, 14)
        .onAppear { isFocused = true }
    }

    private var readingPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            title(isSweeping: true)
            Text(ComposerStatusText.reading(files: draft.files.map(\.name), links: draft.urls.map { $0.host() ?? $0.absoluteString }))
                .font(.system(size: 15, weight: .light))
                .padding(.top, OrionSpacing.sm)
            HStack(alignment: .center) {
                Text(ComposerStatusText.readingDetail)
                    .font(.system(size: 13, weight: .light))
                    .foregroundStyle(Color(red: 0.75, green: 0.94, blue: 0.96))
                Spacer(minLength: OrionSpacing.sm)
                ComposerSendButton(size: ComposerMetrics.sendSize(for: .reading), isBright: false, action: {})
            }
            .padding(.top, OrionSpacing.sm)
        }
        .padding(.horizontal, 24)
        .padding(.top, 14)
        .padding(.bottom, 14)
    }

    private var disabledPill: some View {
        Text("Add a DeepSeek key to let Orion read things. You can still edit everything by hand.")
            .font(.system(size: 13, weight: .light))
            .foregroundStyle(.white.opacity(0.75))
            .multilineTextAlignment(.leading)
            .padding(.horizontal, OrionSpacing.lg)
            .padding(.vertical, OrionSpacing.sm + 2)
    }

    // MARK: Pieces

    private func title(isSweeping: Bool) -> some View {
        HStack(spacing: OrionSpacing.xs) {
            OrionHatMark(
                state: isSweeping ? .working : .needsYou,
                tint: OrionColor.dayBreakBlue.color,
                hop: false,
                label: isSweeping ? "Orion is reading" : "Orion is listening"
            )
            .frame(width: 26, height: 26)
            Text("Orion")
                .font(.system(size: 15, weight: .light))
                .padding(.bottom, 4)
                .overlay(alignment: .bottomLeading) {
                    CyanBrushStroke(isSweeping: isSweeping, width: 150).offset(x: -10, y: 5)
                }
        }
    }

    /// One "+" for everything you can add: a file, or a link from the clipboard.
    private var plusMenu: some View {
        Menu {
            Button("Attach a file…") { isImporting = true }
            Button("Add a link from the clipboard") { addLinkFromClipboard() }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .light))
                .frame(width: 26, height: 26)
                .background(Circle().fill(Color.white.opacity(0.14)))
                .overlay { Circle().strokeBorder(Color.white.opacity(0.3), lineWidth: 1) }
        }
        .menuStyle(.button)
        .menuIndicator(.hidden)
        .buttonStyle(.plain)
        .fixedSize()
        .disabled(!model.store.canEdit)
        .accessibilityLabel("Add a file or link")
    }

    @ViewBuilder private var statusLine: some View {
        switch model.store.composeState {
        case .failed(let message):
            Text(message).font(.caption).foregroundStyle(Color.red.opacity(0.9)).padding(.top, OrionSpacing.xxs)
        case .noResult:
            Text("Orion couldn't find anything usable in that. Try adding a few words about what you like.")
                .font(.caption).foregroundStyle(.white.opacity(0.7)).padding(.top, OrionSpacing.xxs)
        case .done(let skipped) where !skipped.isEmpty:
            Text("Couldn't read: \(skipped.map(\.name).joined(separator: ", "))")
                .font(.caption).foregroundStyle(.white.opacity(0.7)).padding(.top, OrionSpacing.xxs)
        default:
            EmptyView()
        }
    }

    // MARK: Actions

    private func send() async {
        let saveImages = draft.saveImagesToInspiration
        let images = draft.imageFiles
        let request = draft.request(replyTo: draft.replyTargets(pending: model.store.pendingCards), tile: nil)
        guard await model.store.compose(request) else { return }
        if saveImages, !images.isEmpty {
            let captured = images.map { CapturedImage(data: $0.data, sourceURL: nil) }
            await appModel.capture(captured, note: nil, roomID: nil)
        }
        draft = ComposerDraft()
        isExpanded = false
    }

    private func addLinkFromClipboard() {
        linkHint = false
        let text = NSPasteboard.general.string(forType: .string) ?? ""
        if let url = URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines)), draft.addURL(url) == .added { return }
        linkHint = true
        isFocused = true
    }

    private func importFiles(_ urls: [URL]) async {
        for url in urls {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard let loaded = await Self.loadFile(at: url) else { continue }
            _ = draft.addFile(name: loaded.name, data: loaded.data)
        }
    }

    private static var allowedTypes: [UTType] {
        var types: [UTType] = [.pdf, .plainText, .png, .jpeg, .webP, .text]
        if let docx = UTType(filenameExtension: "docx") { types.append(docx) }
        return types
    }

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
