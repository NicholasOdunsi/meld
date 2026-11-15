import WebKit
import OrionAppCore
import OrionDesignSystem
import SwiftUI

enum ProjectPanel: Equatable { case todo, star, canvas, artifacts }

struct ProjectScreen: View {
    @Bindable var frame: FrameModel
    let webView: WKWebView
    @State private var starDialog: StarDialogKind?
    @State private var starReply = ""
    @State private var collapsedStatuses: Set<StreamStar.Status> = [.done]

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 0) {
                VStack(spacing: 0) {
                    stream
                    ChatComposer(frame: frame)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                if frame.projectPanel == .todo || frame.projectPanel == .star {
                    Group {
                        if frame.projectPanel == .star { starDetail }
                        else { todo }
                    }
                        .frame(width: 310)
                        .frame(maxHeight: .infinity)

                }
                divider
                    .opacity(showsWeb ? 1 : 0)
                WebViewHost(webView: webView)
                    .frame(width: showsWeb ? geometry.size.width * (frame.projectPanel == .canvas ? 0.72 : 0.45) : 0)
                    .opacity(showsWeb ? 1 : 0)
                    .allowsHitTesting(showsWeb)
                    .accessibilityHidden(!showsWeb)
            }
        }
        .background(Color.black.opacity(0.18))
        .onChange(of: frame.openStarID) { _, _ in starReply = "" }
        .overlay {
            if let kind = starDialog {
                ZStack {
                    Color.black.opacity(0.25)
                        .contentShape(.rect)
                        .onTapGesture {}
                        .accessibilityHidden(true)
                    StarNameDialog(frame: frame, kind: kind) { starDialog = nil }
                        .id(kind)
                }
            }
        }
    }

    private var showsWeb: Bool { frame.projectPanel == .canvas || frame.projectPanel == .artifacts }
    private var divider: some View {
        Rectangle().fill(.primary.opacity(FrameMetrics.columnDividerOpacity))
            .frame(width: FrameMetrics.columnDividerWidth)
    }

    private var todo: some View {
        Group {
            if let stars = frame.visibleStream?.stars, !stars.isEmpty {
                TimelineView(.everyMinute) { timeline in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            ForEach(Array(StarStatusSections.make(from: stars).enumerated()), id: \.element.status) { index, section in
                                if index > 0 { Divider() }
                                sectionHeader(section)
                                if !collapsedStatuses.contains(section.status) {
                                    ForEach(section.stars) { star in
                                        starRow(star, now: timeline.date)
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                VStack {
                    Spacer()
                    Text("Ask Orion for something and it will show up here.")
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, OrionSpacing.md)
                    Spacer()
                }
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if frame.currentTabs.count > 1 {
                VStack(alignment: .leading, spacing: 0) {
                    Divider()
                    Text("Earlier chats")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(OrionSpacing.md)
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: OrionSpacing.sm) {
                            ForEach(frame.currentTabs.dropFirst()) { tab in
                                Button { frame.openTab(tab.id) } label: {
                                    Label(tab.name, systemImage: "bubble.left")
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.horizontal, OrionSpacing.md)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                    .frame(maxHeight: 190)
                    .padding(.bottom, OrionSpacing.md)
                }
            }
        }
    }

    private func sectionHeader(_ section: StarStatusSection) -> some View {
        let collapsed = collapsedStatuses.contains(section.status)
        return Button {
            if collapsed { collapsedStatuses.remove(section.status) } else { collapsedStatuses.insert(section.status) }
        } label: {
            HStack(spacing: OrionSpacing.xs) {
                Text("\(section.status.label) · \(section.count)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Image(systemName: collapsed ? "chevron.right" : "chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, OrionSpacing.md)
            .padding(.top, OrionSpacing.md)
            .padding(.bottom, OrionSpacing.xs)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(section.status.label), \(section.count)")
        .accessibilityValue(collapsed ? "Collapsed" : "Expanded")
        .accessibilityHint(collapsed ? "Shows these Stars" : "Hides these Stars")
    }

    private func starRow(_ star: StreamStar, now: Date) -> some View {
        HStack(spacing: 0) {
            Button { frame.openStar(star.id) } label: {
                HStack(spacing: OrionSpacing.sm) {
                    statusIcon(star.status)
                    VStack(alignment: .leading, spacing: OrionSpacing.xs) {
                        Text(star.title).fontWeight(.semibold).lineLimit(1)
                        if let constellation = star.constellation {
                            Text(constellation).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    Spacer(minLength: 0)
                    Text(StarStatusSections.shortAge(from: star.createdAt, now: now))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(OrionSpacing.md)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(star.title), \(star.status.label)")
            starMenu(star)
                .padding(.trailing, OrionSpacing.sm)
        }
    }

    @ViewBuilder
    private func statusIcon(_ status: StreamStar.Status) -> some View {
        Group {
            if status == .working {
                ProgressView().controlSize(.small)
            } else {
                Image(systemName: status.symbol)
            }
        }
        .foregroundStyle(status.color)
        .frame(width: 18, height: 18)
        .accessibilityHidden(true)
    }

    private func starMenu(_ star: StreamStar) -> some View {
        Menu {
            Button("Rename") { starDialog = .renameStar(id: star.id, title: star.title) }
            if let constellation = star.constellation {
                Button("Rename \(constellation)…") { starDialog = .renameGroup(constellation) }
            }
            Menu("Move to Constellation") {
                Button("New Constellation…") { starDialog = .newGroup(starID: star.id, title: star.title) }
                ForEach(frame.visibleStream?.constellations ?? [], id: \.self) { name in
                    Button(name) { Task { await frame.setStarConstellation(star.id, title: star.title, name: name) } }
                }
                if star.constellation != nil {
                    Divider()
                    Button("Ungroup") { Task { await frame.setStarConstellation(star.id, title: star.title, name: nil) } }
                }
            }
        } label: {
            Image(systemName: "ellipsis").frame(width: 28, height: 28)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .accessibilityLabel("Options for \(star.title)")
    }

    private var starDetail: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                Button("Constellations", systemImage: "chevron.left") { frame.showConstellations() }
                    .buttonStyle(.plain)
                    .font(.caption)
                if let stream = frame.visibleStream,
                   let star = stream.stars.first(where: { $0.id == frame.openStarID }) {
                    starDetailContent(star, stream: stream)
                } else {
                    Text("This Star isn't in the conversation right now.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(OrionSpacing.md)
        }
    }

    @ViewBuilder
    private func starDetailContent(_ star: StreamStar, stream: StreamSnapshot) -> some View {
        Text(star.title).font(.title3.bold())
        Label(star.status.label, systemImage: star.status.symbol)
            .font(.caption)
            .foregroundStyle(.secondary)
        Divider()
        if let source = stream.messages.first(where: { $0.id == star.sourceMessageID }) {
            Text("Request").font(.caption).foregroundStyle(.secondary)
            Text(source.text)
        } else {
            Text("This request is in an earlier part of the chat.")
                .font(.caption).foregroundStyle(.secondary)
        }
        let replies = stream.messages.filter { $0.taskID == star.id }
        ForEach(replies) { reply in
            Divider()
            Text("Orion").font(.caption).foregroundStyle(.secondary)
            Text(reply.text).textSelection(.enabled)
        }
        let followups = stream.messages.filter { message in
            star.followupMessageIDs.contains(message.id)
            || (message.replyToID.map(star.followupMessageIDs.contains) ?? false)
        }
        ForEach(followups) { message in
            Divider()
            Text(message.authorName).font(.caption).foregroundStyle(.secondary)
            Text(message.text).textSelection(.enabled)
        }
        Divider()
        TextField("Reply in this Star…", text: $starReply, axis: .vertical)
            .lineLimit(2...5)
            .textFieldStyle(.roundedBorder)
        Button("Send reply", systemImage: "arrow.up") {
            let body = starReply.trimmingCharacters(in: .whitespacesAndNewlines)
            Task {
                let selection = frame.selectedStreamModel
                let sent = await frame.sendStream(body, provider: selection.provider, model: selection.model,
                                                  starTaskID: star.id)
                if sent { starReply = "" }
            }
        }
        .disabled(starReply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !stream.canSend)
        if !stream.canSend {
            Text(stream.blockedReason ?? "Orion can't answer right now.")
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private var stream: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: OrionSpacing.lg) {
                    if let stream = frame.visibleStream {
                        ForEach(stream.messages) { message in
                            messageRow(message, stream: stream).id(message.id)
                        }
                    } else {
                        ProgressView("Loading conversation…")
                            .frame(maxWidth: .infinity, minHeight: 200)
                    }
                }
                .frame(maxWidth: 760)
                .padding(OrionSpacing.lg)
                .frame(maxWidth: .infinity)
            }
            .onChange(of: frame.visibleStream?.messages.last?.id) { _, id in
                if let id { withAnimation { proxy.scrollTo(id, anchor: .bottom) } }
            }
        }
    }

    private func messageRow(_ message: StreamMessage, stream: StreamSnapshot) -> some View {
        HStack(alignment: .top, spacing: OrionSpacing.sm) {
            ChatAvatar(isOrion: message.isOrion, size: 28)
            VStack(alignment: .leading, spacing: OrionSpacing.xs) {
                if let quote = stream.quote(for: message) {
                    Text(quote).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                HStack(spacing: OrionSpacing.xs) {
                    Text(message.authorName).fontWeight(.semibold)
                    if message.isOrion { Text("AI").font(.caption2).foregroundStyle(.secondary) }
                    Text(message.createdAt, style: .time).font(.caption).foregroundStyle(.secondary)
                }
                if !message.text.isEmpty {
                    Text(message.text).textSelection(.enabled)
                }
                ForEach(message.attachments) { attachment in
                    Label(attachment.name, systemImage: "paperclip")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if message.isOrion, let taskID = message.taskID,
                   let star = stream.stars.first(where: { $0.id == taskID }) {
                    Button { frame.openStar(star.id) } label: {
                        HStack(spacing: OrionSpacing.xs) {
                            Image(systemName: "sparkle")
                            Text(star.title).lineLimit(1)
                            Text("· \(star.status.label)")
                                .foregroundStyle(.tertiary)
                        }
                    }
                    .buttonStyle(.plain)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Open Star: \(star.title), \(star.status.label)")
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private extension StreamStar.Status {
    var label: String {
        switch self { case .working: "Working"; case .needs_you: "Needs you"; case .stuck: "Stuck"; case .done: "Done" }
    }
    var symbol: String {
        switch self {
        case .working: "circle.dotted"
        case .needs_you: "exclamationmark.circle.fill"
        case .stuck: "xmark.octagon.fill"
        case .done: "checkmark.circle.fill"
        }
    }
    var color: Color {
        switch self { case .working: .blue; case .needs_you: .orange; case .stuck: .red; case .done: .green }
    }
}

enum StarDialogKind: Hashable {
    case renameStar(id: String, title: String)
    case newGroup(starID: String, title: String)
    case renameGroup(String)
}

/// Rename Star / New Constellation / Rename Constellation, in Orion's one
/// dialog shape. Stays open with a short message when the change fails.
private struct StarNameDialog: View {
    let frame: FrameModel
    let kind: StarDialogKind
    let close: () -> Void

    @State private var name: String
    @State private var error: String?
    @State private var saving = false
    @FocusState private var focused: Bool

    init(frame: FrameModel, kind: StarDialogKind, close: @escaping () -> Void) {
        self.frame = frame
        self.kind = kind
        self.close = close
        switch kind {
        case .renameStar(_, let title): _name = State(initialValue: title)
        case .newGroup: _name = State(initialValue: "")
        case .renameGroup(let current): _name = State(initialValue: current)
        }
    }

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        OrionDialog(
            title: Text(titleText),
            actionTitle: kind.isCreate ? "Create" : "Save",
            canConfirm: !trimmed.isEmpty && !saving,
            onCancel: close,
            onConfirm: save
        ) {
            TextField(fieldPrompt, text: $name)
                .orionDialogField()
                .focused($focused)
                .onSubmit(save)
            if let error {
                Text(error).font(.caption).foregroundStyle(.red)
            }
        }
        .defaultFocus($focused, true)
        .onAppear { focused = true }
        .onChange(of: name) { _, _ in error = nil }
    }

    private var titleText: LocalizedStringKey {
        switch kind {
        case .renameStar: "Rename Star"
        case .newGroup: "New Constellation"
        case .renameGroup: "Rename Constellation"
        }
    }

    private var fieldPrompt: LocalizedStringKey {
        if case .renameStar = kind { "Star name" } else { "Constellation name" }
    }

    private func save() {
        guard !trimmed.isEmpty, !saving else { return }
        saving = true
        Task {
            let ok: Bool
            switch kind {
            case .renameStar(let id, _): ok = await frame.renameStar(id, to: trimmed)
            case .newGroup(let starID, let title): ok = await frame.setStarConstellation(starID, title: title, name: trimmed)
            case .renameGroup(let current): ok = await frame.renameConstellation(current, to: trimmed)
            }
            saving = false
            if ok { close(); return }
            error = frame.errorMessage ?? String(localized: "That didn't work. Try a different name.")
            frame.errorMessage = nil
        }
    }
}

private extension StarDialogKind {
    var isCreate: Bool { if case .newGroup = self { true } else { false } }
}
