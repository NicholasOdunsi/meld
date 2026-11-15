import OrionAppCore
import OrionDesignSystem
import SwiftUI
import UniformTypeIdentifiers

private struct StagedChatFile: Identifiable {
    let id: String
    let name: String
}

/// The chat composer. With a `star`, it replies inside that Star's thread
/// instead of the main chat: its own draft, a narrower layout, and the
/// can't-send reason shown up front.
struct ChatComposer: View {
    @Bindable var frame: FrameModel
    var star: StreamStar?
    @State private var text = ""
    @State private var sending = false
    @State private var isImporting = false
    @State private var staging = false
    @State private var attachments: [StagedChatFile] = []
    @State private var notices = ComposerNoticeCenter()
    /// Set only by the person clicking the resting bar. Focus alone never
    /// opens the composer: AppKit can hand a field focus by itself at launch.
    @State private var isUserOpened = false
    /// One-shot: focus the text field the moment it appears after that click.
    @State private var wantsFocus = false
    @FocusState private var isFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var snapshot: StreamSnapshot? { frame.visibleStream }
    private var choice: StreamModelChoice? {
        guard let snapshot else { return nil }
        let selected = frame.modelByProject[snapshot.projectID] ?? snapshot.defaultProvider
        return snapshot.choices.first(where: { $0.provider == selected }) ?? snapshot.choices.first
    }

    private var modelLabel: String {
        guard let snapshot, let choice else { return "Model" }
        let model = frame.selectedModelByProject[snapshot.projectID] ?? choice.defaultModel
        return model.map { "\(choice.provider.capitalized) · \($0)" } ?? choice.provider.capitalized
    }

    private var placeholder: String { ChatComposerState.placeholder(isStarThread: star != nil) }

    /// Apple-style size grow, the same feel as the Taste composer's phases.
    private var grow: Animation { reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.32) }

    private var isOpen: Bool {
        ChatComposerState.isExpanded(draft: text, hasAttachments: !attachments.isEmpty,
                                     isUserOpened: isUserOpened, isFocused: isFocused,
                                     isInteracting: isImporting)
    }

    private var canSendNow: Bool {
        !((text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && attachments.isEmpty) || sending || staging)
    }

    var body: some View {
        VStack(spacing: OrionSpacing.xs) {
            if let notice = notices.current {
                ComposerStatusPill(notice: notice) { notices.dismiss() }
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
            }
            // One shell, one width, laid out like Taste's composer. Resting is
            // a slim one-line bar; open adds the text area on top. The bottom
            // bar (+ left) is the same in both and the send circle floats in an
            // overlay, so neither moves while the shell grows upward.
            VStack(alignment: .leading, spacing: 0) {
                if isOpen {
                    VStack(alignment: .leading, spacing: OrionSpacing.sm) {
                        ForEach(attachments) { file in
                            HStack(spacing: OrionSpacing.xs) {
                                Image(systemName: "paperclip")
                                Text(file.name).lineLimit(1)
                                Button("Remove \(file.name)", systemImage: "xmark") {
                                    attachments.removeAll { $0.id == file.id }
                                    Task { await frame.discardStreamAttachment(file.id) }
                                }
                                .labelStyle(.iconOnly)
                                .buttonStyle(.plain)
                            }
                            .font(.caption)
                        }
                        // The hint is drawn here rather than by the field: a
                        // focused, empty field hides its own, and the hint
                        // should stay until the first character is typed.
                        TextField("", text: $text, axis: .vertical)
                            .font(.system(size: ComposerMetrics.textFontSize, weight: .light))
                            .lineLimit(ChatComposerState.lineLimits(isStarThread: star != nil))
                            .textFieldStyle(.plain)
                            .overlay(alignment: .topLeading) {
                                if ChatComposerState.showsPlaceholder(draft: text) {
                                    Text(placeholder)
                                        .font(.system(size: ComposerMetrics.textFontSize, weight: .light))
                                        .foregroundStyle(.white.opacity(0.6))
                                        .allowsHitTesting(false)
                                }
                            }
                            .accessibilityLabel(placeholder)
                            .focused($isFocused)
                            .onSubmit { Task { await send() } }
                            .onKeyPress(keys: [.escape]) { _ in
                                isFocused = false
                                return .handled
                            }
                            .onAppear {
                                guard wantsFocus else { return }
                                wantsFocus = false
                                isFocused = true
                            }
                            .padding(.top, OrionSpacing.xs)
                    }
                    // Instant content; the shell's height is what eases.
                    .transition(.identity)
                }
                bottomRow
                    .padding(.top, isOpen ? ComposerMetrics.openBarGap : 0)
            }
            .padding(.leading, ComposerMetrics.restingLeading)
            // Room for the overlaid send circle (size + trailing inset).
            .padding(.trailing, ComposerMetrics.sendReserve)
            .padding(.top, isOpen ? ComposerMetrics.openTopInset : ComposerMetrics.restingTopInset)
            .padding(.bottom, ComposerMetrics.bottomInset)
            .frame(maxWidth: .infinity, alignment: .leading)
            .overlay(alignment: .bottomTrailing) {
                // Dim at rest and until there is something to send, like Taste.
                ComposerSendButton(
                    size: ComposerMetrics.sendSize,
                    isBright: isOpen && canSendNow,
                    action: { Task { await send() } },
                    accessibilityLabel: star == nil ? "Send message" : "Send reply"
                )
                .padding(.trailing, ComposerMetrics.sendTrailingInset)
                .padding(.bottom, ComposerMetrics.bottomInset)
                .geometryGroup()
            }
            .clipped()
            .iceGlass(cornerRadius: ComposerMetrics.cornerRadius)
            .foregroundStyle(.white)
        }
        .frame(maxWidth: ComposerMetrics.openWidth)
        .padding(.horizontal, star == nil ? OrionSpacing.lg : OrionSpacing.md)
        .padding(.bottom, star == nil ? OrionSpacing.lg : OrionSpacing.md)
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.28), value: notices.current?.id)
        .animation(grow, value: isOpen)
        .onChange(of: isFocused) { _, focused in
            // Clicking away or Escape rests the bar again (if nothing is drafted).
            if !focused { isUserOpened = false }
        }
        .fileImporter(isPresented: $isImporting, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            guard case .success(let urls) = result else { return }
            Task { await stage(urls) }
        }
        .task(id: snapshot?.canSend) {
            // Inside a Star, say up front why a reply can't be sent.
            guard star != nil, let snapshot else { return }
            guard !snapshot.canSend else { notices.dismiss(); return }
            notices.show(snapshot.blockedReason ?? "Orion can't answer right now.", kind: .error)
        }
        .task(id: notices.current?.id) {
            guard let notice = notices.current, let lifetime = notice.lifetime else { return }
            do { try await Task.sleep(for: lifetime) } catch { return }
            notices.dismiss(id: notice.id)
        }
    }

    private var bottomRow: some View {
        HStack(spacing: OrionSpacing.sm) {
            Button { isImporting = true } label: { ComposerPlusCircle() }
                .buttonStyle(.plain)
                .pointerStyle(.link)
                .accessibilityLabel("Attach a file")
                .help("Attach files")
            if isOpen {
                Spacer(minLength: OrionSpacing.sm)
                if staging { ProgressView().controlSize(.small).help("Adding files") }
                if let snapshot {
                    if star == nil {
                        // Full label when it fits; in a narrow chat it
                        // truncates instead of pushing past the column.
                        ViewThatFits(in: .horizontal) {
                            modelMenu(snapshot).fixedSize(horizontal: true, vertical: false)
                            modelMenu(snapshot)
                        }
                    } else {
                        modelMenu(snapshot)
                    }
                }
                if snapshot?.orionBusy == true { ProgressView().controlSize(.small).help("Orion is working") }
            } else {
                // Resting: the placeholder takes the middle; tapping it opens the composer.
                Text(placeholder)
                    .font(.system(size: ComposerMetrics.hintFontSize, weight: .light))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                    .contentShape(.rect)
                    .onTapGesture { open() }
                    .pointerStyle(.link)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityLabel(placeholder)
            }
        }
        .frame(height: ComposerMetrics.plusSize)
    }

    /// The person clicked the resting bar: open it and focus the text field.
    private func open() {
        wantsFocus = true
        isUserOpened = true
    }

    private func modelMenu(_ snapshot: StreamSnapshot) -> some View {
        Menu {
            ForEach(snapshot.choices) { option in
                if option.models.isEmpty {
                    Button(option.provider.capitalized) {
                        frame.modelByProject[snapshot.projectID] = option.provider
                        frame.selectedModelByProject[snapshot.projectID] = ""
                    }
                } else {
                    Menu(option.provider.capitalized) {
                        ForEach(option.models, id: \.self) { model in
                            Button(model) {
                                frame.modelByProject[snapshot.projectID] = option.provider
                                frame.selectedModelByProject[snapshot.projectID] = model
                            }
                        }
                    }
                }
            }
        } label: {
            Label(modelLabel, systemImage: "chevron.down")
                .font(.system(size: ComposerMetrics.hintFontSize, weight: .light))
                .lineLimit(1)
        }
        .menuStyle(.borderlessButton)
    }

    private func stage(_ urls: [URL]) async {
        guard attachments.count + urls.count <= 10 else {
            notices.show("You can add up to 10 files.", kind: .error)
            return
        }
        staging = true
        defer { staging = false }
        for url in urls {
            if let id = await frame.stageStreamAttachment(url) {
                attachments.append(StagedChatFile(id: id, name: url.lastPathComponent))
            } else {
                notices.show(frame.errorMessage ?? "Could not add that file.", kind: .error)
                frame.errorMessage = nil
            }
        }
    }

    private func send() async {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty || !attachments.isEmpty, !sending else { return }
        guard let snapshot else { return }
        guard snapshot.canSend else {
            notices.show(snapshot.blockedReason ?? "Orion can't answer right now.", kind: .error)
            return
        }
        sending = true
        notices.dismiss()
        let selection = frame.selectedStreamModel
        let success = await frame.sendStream(body, provider: selection.provider, model: selection.model,
                                             attachmentIDs: attachments.map(\.id), starTaskID: star?.id)
        sending = false
        if success {
            text = ""; attachments = []
            isFocused = false
            isUserOpened = false
        }
        else { notices.show(frame.errorMessage ?? "Orion couldn't send that right now.", kind: .error); frame.errorMessage = nil }
    }
}
