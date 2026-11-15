import WebKit
import OrionAppCore
import OrionDesignSystem
import SwiftUI
import QuickLook

enum ProjectPanel: Equatable { case todo, star, canvas, artifacts }

struct ProjectScreen: View {
    @Bindable var frame: FrameModel
    let webView: WKWebView
    @State private var starDialog: StarDialogKind?
    @State private var collapsedStatuses: Set<StreamStar.Status> = [.done]
    @State private var openArtifactID: String?
    @State private var artifactFilter: StreamArtifact.Kind?
    @State private var previewArtifact: StreamArtifact?
    @State private var previewFileURL: URL?

    var body: some View {
        GeometryReader { geometry in
            // Every width here comes from one `DetailSplit`, the same one the
            // frame uses to draw the divider and the panel title, so the chat
            // can never be wider than the room left of the divider.
            let split = frame.detailSplit(detailWidth: geometry.size.width)
            HStack(spacing: 0) {
                VStack(spacing: 0) {
                    if let stream = frame.visibleStream, let star = canvasStar(in: stream) {
                        starThread(star, stream: stream, showsProjectReturn: true)
                    } else {
                        self.stream
                        ChatComposer(frame: frame)
                    }
                }
                .frame(width: split.chatWidth)
                .frame(maxHeight: .infinity)
                .clipped()
                // The divider itself is drawn once, full height, by the frame
                // (it runs up through the header); this just keeps its slot.
                Color.clear
                    .frame(width: split.dividerWidth)
                if frame.projectPanel == .todo || frame.projectPanel == .star || (frame.projectPanel == .artifacts && openArtifactID == nil) {
                    Group {
                        if frame.projectPanel == .star { starDetail }
                        else if frame.projectPanel == .artifacts {
                            if let previewArtifact { inspirationPreview(previewArtifact) }
                            else { artifactsPanel }
                        }
                        else { todo }
                    }
                        .frame(width: split.panelWidth)
                        .frame(maxHeight: .infinity)
                        .clipped()
                        .overlay(alignment: .leading) {
                            PanelResizeHandle(frame: frame, detailWidth: geometry.size.width)
                        }
                }
                VStack(spacing: 0) {
                    if frame.projectPanel == .artifacts && openArtifactID != nil {
                        Button("‹ Artifacts") {
                            openArtifactID = nil
                            if let room = frame.visibleStream?.roomID,
                               let workspace = frame.snapshot?.workspaceID {
                                frame.openArtifactPath("/\(workspace)/rooms/\(room)?tab=conversation")
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(OrionSpacing.md)
                    }
                    WebViewHost(webView: webView)
                        .frame(maxHeight: .infinity)
                }
                    .frame(width: showsWeb ? split.panelWidth : 0)
                    .opacity(showsWeb ? 1 : 0)
                    .allowsHitTesting(showsWeb)
                    .accessibilityHidden(!showsWeb)
                    .overlay(alignment: .leading) {
                        if frame.projectPanel == .artifacts && openArtifactID != nil {
                            PanelResizeHandle(frame: frame, detailWidth: geometry.size.width)
                        }
                    }
            }
            .frame(width: geometry.size.width, alignment: .leading)
        }
        .background(Color.black.opacity(0.18))
        .onChange(of: frame.projectPanel) { _, panel in
            if panel != .artifacts { openArtifactID = nil; previewArtifact = nil }
        }
        .task(id: canvasFocusKey) { await syncCanvasFocus() }
        .quickLookPreview($previewFileURL)
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

    private var showsWeb: Bool { frame.projectPanel == .canvas || (frame.projectPanel == .artifacts && openArtifactID != nil) }

    private func canvasStar(in stream: StreamSnapshot) -> StreamStar? {
        guard frame.projectPanel == .canvas, let id = frame.canvasStarID else { return nil }
        return stream.stars.first(where: { $0.id == id })
    }

    private var canvasFocusKey: String {
        guard frame.projectPanel == .canvas else { return "closed" }
        return "\(frame.visibleStream?.roomID ?? "loading"):\(frame.canvasStarID ?? frame.canvasScreenID ?? "project")"
    }

    @MainActor
    private func syncCanvasFocus() async {
        guard frame.projectPanel == .canvas, let stream = frame.visibleStream else { return }
        let roomID = stream.roomID
        let succeeded: Bool
        if let screenID = frame.canvasScreenID {
            succeeded = await runCanvasCommand(
                "return window.__orionBoard?.roomId === roomId && (await window.__orionBoard.focusScreen(screenId)) === true",
                arguments: ["roomId": roomID, "screenId": screenID]
            )
        } else if let star = canvasStar(in: stream) {
            succeeded = await runCanvasCommand(
                "return window.__orionBoard?.roomId === roomId && window.__orionBoard.focusStar(starId, title) === true",
                arguments: ["roomId": roomID, "starId": star.id, "title": star.title]
            )
        } else {
            succeeded = await runCanvasCommand(
                "return window.__orionBoard?.roomId === roomId && window.__orionBoard.focusAll() === true",
                arguments: ["roomId": roomID]
            )
        }
        if !succeeded && !Task.isCancelled { frame.errorMessage = "Canvas is still loading. Try again." }
    }

    @MainActor
    private func runCanvasCommand(_ script: String, arguments: [String: Any]) async -> Bool {
        for _ in 0..<20 where !Task.isCancelled {
            let result = try? await webView.callAsyncJavaScript(script, arguments: arguments, in: nil, contentWorld: .page)
            if result as? Bool == true { return true }
            try? await Task.sleep(for: .milliseconds(250))
        }
        return false
    }

    private var artifactsPanel: some View {
        let items = frame.visibleStream?.artifacts ?? []
        let filtered = items.filter { artifactFilter == nil || $0.kind == artifactFilter }
        return VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: OrionSpacing.sm) {
                    filterButton("All", kind: nil)
                    ForEach(StreamArtifact.Kind.allCases, id: \.self) { kind in
                        filterButton(kind.label, kind: kind)
                    }
                }
            }
            .frame(height: OrionSpacing.lg)
            .padding(OrionSpacing.md)
            if filtered.isEmpty {
                VStack(spacing: OrionSpacing.sm) {
                    Spacer()
                    Image(systemName: "tray")
                        .font(.title3)
                        .foregroundStyle(.tertiary)
                    Text(items.isEmpty ? "No artifacts yet" : "No \(artifactFilter?.label ?? "artifacts") yet")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(items.isEmpty ? "Files and creations appear here." : "Try another filter.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(filtered) { item in
                            Button { openArtifact(item) } label: {
                                HStack(spacing: OrionSpacing.sm) {
                                    Image(systemName: item.kind.symbol).foregroundStyle(.secondary)
                                    VStack(alignment: .leading, spacing: OrionSpacing.xs) {
                                        Text(item.title).lineLimit(1)
                                        Text(item.kind.label).font(.caption).foregroundStyle(.secondary)
                                        if let starID = item.starID,
                                           let star = frame.visibleStream?.stars.first(where: { $0.id == starID }) {
                                            Text(star.title).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                                        }
                                    }
                                    Spacer(minLength: 0)
                                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                                }
                                .padding(.horizontal, OrionSpacing.md)
                                .padding(.vertical, OrionSpacing.sm)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .disabled(item.href == nil)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func filterButton(_ title: String, kind: StreamArtifact.Kind?) -> some View {
        Button(title) { artifactFilter = kind }
            .buttonStyle(.plain)
            .font(.subheadline.weight(artifactFilter == kind ? .semibold : .regular))
            .foregroundStyle(artifactFilter == kind ? .primary : .secondary)
    }

    private func openArtifact(_ item: StreamArtifact) {
        if item.kind == .screen, item.id.hasPrefix("screen:") {
            frame.openScreenInCanvas(String(item.id.dropFirst("screen:".count)))
            return
        }
        if item.kind == .inspiration, item.previewURL != nil {
            previewArtifact = item
            return
        }
        guard let href = item.href else { return }
        if item.kind == .file, let url = URL(string: href) {
            Task {
                do {
                    let (download, _) = try await URLSession.shared.download(from: url)
                    let destination = FileManager.default.temporaryDirectory
                        .appendingPathComponent(UUID().uuidString)
                        .appendingPathExtension(URL(fileURLWithPath: item.title).pathExtension)
                    try FileManager.default.moveItem(at: download, to: destination)
                    previewFileURL = destination
                } catch { NSWorkspace.shared.open(url) }
            }
        } else if href.hasPrefix("http") {
            if let url = URL(string: href) { NSWorkspace.shared.open(url) }
        } else {
            openArtifactID = item.id
            frame.openArtifactPath(href)
        }
    }

    private func inspirationPreview(_ item: StreamArtifact) -> some View {
        VStack(spacing: OrionSpacing.md) {
            Button("‹ Artifacts") { previewArtifact = nil }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let address = item.previewURL, let url = URL(string: address) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFit()
                } placeholder: {
                    ProgressView()
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            Text(item.title).font(.caption).foregroundStyle(.secondary)
        }
        .padding(OrionSpacing.md)
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
                .padding(.horizontal, OrionSpacing.md)
                .padding(.vertical, OrionSpacing.xs)
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

    /// No back row: the toolbar's Constellations icon returns to the list,
    /// and the panel header's ✕ closes it.
    private var starDetail: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let stream = frame.visibleStream,
               let star = stream.stars.first(where: { $0.id == frame.openStarID }) {
                starThread(star, stream: stream)
            } else {
                Text("This Star isn't in the conversation right now.")
                    .font(.caption).foregroundStyle(.secondary)
                    .padding(OrionSpacing.md)
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A Star read like a chat thread: the request, then everything said
    /// inside the Star, with its own composer pinned below.
    @ViewBuilder
    private func starThread(_ star: StreamStar, stream: StreamSnapshot, showsProjectReturn: Bool = false) -> some View {
        let thread = stream.thread(for: star)
        if showsProjectReturn {
            HStack(spacing: 0) {
                Button {
                    frame.showProjectCanvas()
                } label: {
                    HStack(spacing: OrionSpacing.xs) {
                        Image(systemName: "chevron.left").font(.caption.weight(.semibold))
                        Text("Project conversation").font(.subheadline)
                    }
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, OrionSpacing.sm)
                    .padding(.vertical, OrionSpacing.xs)
                    .background(.primary.opacity(0.07), in: .capsule)
                    .contentShape(.capsule)
                }
                .buttonStyle(.plain)
                .help("Back to the project conversation")
                Spacer(minLength: 0)
            }
            .padding(.horizontal, OrionSpacing.md)
            .padding(.top, OrionSpacing.sm)
            .padding(.bottom, OrionSpacing.xs)
        }
        BottomAnchoredScroll(lastID: thread.replies.last?.id) {
            LazyVStack(alignment: .leading, spacing: OrionSpacing.lg) {
                if let request = thread.request {
                    StreamMessageRow(message: request, stream: stream, showsQuote: false, avatarGap: OrionSpacing.xs)
                        .id(request.id)
                } else {
                    Text("This request is in an earlier part of the chat.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                ForEach(thread.replies) { message in
                    StreamMessageRow(message: message, stream: stream, showsQuote: false, avatarGap: OrionSpacing.xs)
                        .id(message.id)
                }
                if let activity = stream.activity(forStar: star.id) {
                    ActivityLine(activity: activity) { Task { await frame.retryDesignProposal(activity.taskID) } }.id("activity")
                }
            }
            .padding(OrionSpacing.md)
        }
        // A different Star is a different conversation: start it at its end.
        .id(star.id)
        .frame(maxHeight: .infinity)
        ChatComposer(frame: frame, star: star)
            .id(star.id)
    }

    /// The main chat, bottom-anchored like a Star's thread (same container).
    @ViewBuilder
    private var stream: some View {
        if let stream = frame.visibleStream {
            BottomAnchoredScroll(lastID: stream.mainChatTimeline.last?.scrollID) {
                LazyVStack(alignment: .leading, spacing: OrionSpacing.lg) {
                    ForEach(stream.mainChatTimeline) { item in
                        switch item {
                        case .message(let message):
                            StreamMessageRow(message: message, stream: stream) { frame.openStar($0) }
                                .id(message.id)
                        case .screen(let screen):
                            ScreenCard(screen: screen, store: .shared) { frame.openScreenInCanvas($0.id) }
                                .padding(.leading, 28 + OrionSpacing.sm)
                                .id("screen:\(screen.id)")
                        case .screenGroup: EmptyView()
                        }
                    }
                    if let activity = stream.activity(forStar: nil) {
                        ActivityLine(activity: activity) { Task { await frame.retryDesignProposal(activity.taskID) } }.id("activity")
                    }
                }
                .frame(maxWidth: 760)
                .padding(OrionSpacing.lg)
                .frame(maxWidth: .infinity)
            }
            // Another chat opens at its own latest message.
            .id(stream.roomID)
            .frame(maxHeight: .infinity)
        } else {
            ProgressView("Loading conversation…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

extension StreamStar.Status {
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
