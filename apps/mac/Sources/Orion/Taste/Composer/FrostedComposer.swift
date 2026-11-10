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
    /// Orion hat + name fade in after the shell starts growing.
    @State private var chromeOpacity: Double = 0
    /// Send circle pops in on open — separate from shell grow so it doesn't warp.
    @State private var sendReveal: Double = 1

    private var composerEnabled: Bool { model.store.snapshot?.composerEnabled != false }
    private var isReading: Bool {
        if case .reading = model.store.composeState { return true }
        return false
    }
    private var hasContent: Bool { !draft.words.isEmpty || !draft.files.isEmpty || !draft.urls.isEmpty }
    private var phase: ComposerPhase { .of(isExpanded: isExpanded, isReading: isReading) }
    private var skipped: [TasteComposeSkipped] {
        switch model.store.composeState {
        case .done(let skipped), .noResult(let skipped): skipped
        default: []
        }
    }
    private var sendIsBright: Bool {
        ComposerSend.isBright(canSend: draft.canRead, canEdit: model.store.canEdit, isReading: isReading)
    }

    /// Hints and errors under the field — red when something went wrong.
    private var statusMessage: (text: String, isError: Bool)? {
        if linkHint {
            return ("Copy a link, then tap +, or paste it into the box.", false)
        }
        switch model.store.composeState {
        case .failed(let message):
            return (message, true)
        case .noResult(let skipped) where !skipped.isEmpty:
            return ("Couldn't read: \(skipped.map(\.name).joined(separator: ", ")). Add a few words, or try another link.", true)
        case .noResult:
            return ("Nothing new fit your Taste. Lists may be full, or try saying what to change.", true)
        case .done(let skipped) where !skipped.isEmpty:
            return ("Couldn't read: \(skipped.map(\.name).joined(separator: ", "))", true)
        default:
            return nil
        }
    }

    /// Apple-style size grow — smooth, no opacity crossfade of whole panels.
    private var grow: Animation { .smooth(duration: 0.32) }

    var body: some View {
        VStack(spacing: 0) {
            if phase == .open {
                Color.clear
                    .contentShape(.rect)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .onTapGesture { collapseToRest() }
                    .accessibilityLabel("Dismiss composer")
                    .accessibilityAddTraits(.isButton)
            } else {
                Spacer(minLength: 0)
            }
            Group {
                if !composerEnabled {
                    disabledPill
                } else {
                    shell
                }
            }
            .frame(width: ComposerMetrics.width(for: phase, available: availableWidth), alignment: .leading)
            .clipped()
            .iceGlass(cornerRadius: ComposerMetrics.cornerRadius)
            .foregroundStyle(.white)
            .padding(.bottom, OrionSpacing.lg)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        .animation(grow, value: phase)
        .fileImporter(isPresented: $isImporting, allowedContentTypes: Self.allowedTypes, allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            Task { await importFiles(urls) }
        }
        .onChange(of: hasContent) { _, filled in
            if filled { expand() }
        }
        .onChange(of: isReading) { _, reading in
            // Stay fully revealed while Orion is reading.
            if reading { chromeOpacity = 1 }
        }
    }

    /// One continuous shell: resting is the compact bar; open/reading grow the top.
    /// Send sits in an overlay so HStack reflow never moves or warps the circle.
    private var shell: some View {
        VStack(alignment: .leading, spacing: 0) {
            if phase != .resting {
                // Instant content; the clipped shell's height is what eases — no fade residue.
                expandedTop
                    .transition(.identity)
            }
            bottomBar
                .padding(.top, phase == .resting ? 0 : OrionSpacing.md)
        }
        .padding(.leading, phase == .resting ? OrionSpacing.md : 24)
        // Room for the overlaid send circle (size + trailing inset).
        .padding(.trailing, OrionSpacing.sm + ComposerMetrics.sendSize + OrionSpacing.sm)
        .padding(.top, phase == .resting ? 11 : 14)
        .padding(.bottom, 11)
        .overlay(alignment: .bottomTrailing) {
            ComposerSendButton(
                size: ComposerMetrics.sendSize,
                isBright: phase == .resting ? false : sendIsBright,
                action: phase == .resting || isReading ? {} : { Task { await send() } }
            )
            .scaleEffect(0.88 + 0.12 * sendReveal)
            .opacity(0.45 + 0.55 * sendReveal)
            .padding(.trailing, OrionSpacing.sm)
            .padding(.bottom, 11)
            // Own animation lane — shell grow must not interpolate this frame.
            .geometryGroup()
        }
    }

    @ViewBuilder private var expandedTop: some View {
        if isReading {
            title(isSweeping: true)
            Text(ComposerStatusText.reading(files: draft.files.map(\.name), links: draft.urls.map { $0.host() ?? $0.absoluteString }))
                .font(.system(size: 15, weight: .light))
                .padding(.top, OrionSpacing.sm)
            Text(ComposerStatusText.readingDetail)
                .font(.system(size: 13, weight: .light))
                .foregroundStyle(Color(red: 0.75, green: 0.94, blue: 0.96))
                .padding(.top, OrionSpacing.sm)
                .padding(.bottom, OrionSpacing.sm)
        } else {
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
                    collapseToRest()
                    return .handled
                }
                .onAppear { isFocused = true }
            if draft.words.count > 3500 {
                Text("\(draft.words.count)/\(ComposerDraft.maxWords)")
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(draft.words.count > ComposerDraft.maxWords ? Color.red : Color.white.opacity(0.6))
                    .padding(.top, OrionSpacing.xxs)
            }
        }
    }

    private var bottomBar: some View {
        HStack(spacing: OrionSpacing.sm) {
            plusMenu
            if phase == .resting {
                Text("Tell Orion something…")
                    .font(.system(size: 13, weight: .light))
                    .foregroundStyle(.white.opacity(0.6))
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if !isReading, !draft.imageFiles.isEmpty {
                Toggle("Also save images to Inspiration", isOn: $draft.saveImagesToInspiration)
                    .toggleStyle(.checkbox)
                    .font(.caption)
                    .help("When on, attached images are also saved to Inspiration after a successful read.")
                Spacer(minLength: OrionSpacing.sm)
            } else {
                Spacer(minLength: OrionSpacing.sm)
            }
        }
        .contentShape(.rect)
        .onTapGesture {
            guard phase == .resting else { return }
            expand()
        }
        .pointerStyle(phase == .resting ? .link : .default)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(phase == .resting ? .isButton : [])
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
        HStack(alignment: .firstTextBaseline, spacing: OrionSpacing.xs) {
            OrionHatMark(
                state: isSweeping ? .working : .needsYou,
                tint: OrionColor.dayBreakBlue.color,
                hop: false,
                label: isSweeping ? "Orion is reading" : "Orion is listening"
            )
            .frame(width: 34, height: 34)
            .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 8 }
            Text("Orion")
                .font(.system(size: 15, weight: .light))
                .padding(.bottom, 4)
                .overlay(alignment: .bottomLeading) {
                    CyanBrushStroke(isSweeping: isSweeping, width: 150).offset(x: -10, y: 5)
                }
            Spacer(minLength: OrionSpacing.sm)
            if let status = statusMessage, !isSweeping {
                Text(status.text)
                    .font(.caption)
                    .foregroundStyle(status.isError ? Color.red.opacity(0.95) : Color.white.opacity(0.72))
                    .multilineTextAlignment(.trailing)
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .opacity(chromeOpacity)
    }

    /// One "+" for everything you can add: a file, or a link from the clipboard.
    private var plusMenu: some View {
        Menu {
            Button("Attach a file…") { isImporting = true }
            Button("Add a link from the clipboard") { addLinkFromClipboard() }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .light))
                .frame(width: 32, height: 32)
                .contentShape(.circle)
                .background(Circle().fill(Color.white.opacity(0.14)))
                .overlay { Circle().strokeBorder(Color.white.opacity(0.3), lineWidth: 1) }
        }
        .menuStyle(.button)
        .menuIndicator(.hidden)
        .buttonStyle(.plain)
        .pointerStyle(.link)
        .fixedSize()
        .disabled(!model.store.canEdit)
        .accessibilityLabel("Add a file or link")
    }

    // MARK: Actions

    private func expand() {
        sendReveal = 0
        withAnimation(grow) { isExpanded = true }
        // Hat + "Orion" ease in slightly after the grow starts.
        withAnimation(.easeOut(duration: 0.28).delay(0.06)) { chromeOpacity = 1 }
        // Arrow pops after the shell has room — scale + opacity, not layout.
        withAnimation(.spring(response: 0.38, dampingFraction: 0.72).delay(0.1)) { sendReveal = 1 }
    }

    private func collapseToRest() {
        isFocused = false
        linkHint = false
        withAnimation(.easeIn(duration: 0.12)) {
            chromeOpacity = 0
            sendReveal = 0.85
        }
        withAnimation(grow) { isExpanded = false }
        // Resting keeps the circle visible; settle reveal without a second pop.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.28) {
            sendReveal = 1
        }
        model.store.dismissComposeResult()
    }

    private func send() async {
        let saveImages = draft.saveImagesToInspiration
        let images = draft.imageFiles
        linkHint = false
        let request = draft.request(replyTo: draft.replyTargets(pending: model.store.pendingCards), tile: nil)
        guard await model.store.compose(request) else { return }
        if saveImages, !images.isEmpty {
            let captured = images.map { CapturedImage(data: $0.data, sourceURL: nil) }
            await appModel.capture(captured, note: nil, roomID: nil)
        }
        draft = ComposerDraft()
        collapseToRest()
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
