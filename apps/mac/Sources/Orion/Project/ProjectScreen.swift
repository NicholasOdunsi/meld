import WebKit
import OrionAppCore
import OrionDesignSystem
import SwiftUI

enum ProjectPanel: Equatable { case todo, star, canvas, artifacts }

struct ProjectScreen: View {
    @Bindable var frame: FrameModel
    let webView: WKWebView
    @State private var renamingStarID: String?
    @State private var renameDraft = ""
    @State private var groupingStarID: String?
    @State private var groupDraft = ""
    @State private var renamingGroup: String?
    @State private var groupRenameDraft = ""
    @State private var starReply = ""

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
        .alert("Rename Star", isPresented: Binding(
            get: { renamingStarID != nil }, set: { if !$0 { renamingStarID = nil } }
        )) {
            TextField("Star name", text: $renameDraft)
            Button("Save") {
                if let id = renamingStarID { Task { await frame.renameStar(id, to: renameDraft) } }
                renamingStarID = nil
            }
            Button("Cancel", role: .cancel) { renamingStarID = nil }
        }
        .alert("New Constellation", isPresented: Binding(
            get: { groupingStarID != nil }, set: { if !$0 { groupingStarID = nil } }
        )) {
            TextField("Constellation name", text: $groupDraft)
            Button("Create") {
                if let star = frame.visibleStream?.stars.first(where: { $0.id == groupingStarID }) {
                    Task { await frame.setStarConstellation(star.id, title: star.title, name: groupDraft) }
                }
                groupingStarID = nil
            }
            Button("Cancel", role: .cancel) { groupingStarID = nil }
        }
        .alert("Rename Constellation", isPresented: Binding(
            get: { renamingGroup != nil }, set: { if !$0 { renamingGroup = nil } }
        )) {
            TextField("Constellation name", text: $groupRenameDraft)
            Button("Save") {
                if let name = renamingGroup { Task { await frame.renameConstellation(name, to: groupRenameDraft) } }
                renamingGroup = nil
            }
            Button("Cancel", role: .cancel) { renamingGroup = nil }
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
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(starGroups(stars), id: \.self) { group in
                            HStack {
                                Text(group)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Spacer()
                                if group != "Ungrouped" {
                                    Button("Rename \(group)", systemImage: "ellipsis") {
                                        renamingGroup = group
                                        groupRenameDraft = group
                                    }
                                    .labelStyle(.iconOnly)
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, OrionSpacing.md)
                            .padding(.top, OrionSpacing.md)
                            .padding(.bottom, OrionSpacing.xs)
                            Divider()
                            ForEach(stars.filter { ($0.constellation ?? "Ungrouped") == group }) { star in
                                HStack(spacing: 0) {
                                    Button { frame.openStar(star.id) } label: {
                                        HStack(spacing: OrionSpacing.sm) {
                                            Image(systemName: "sparkle")
                                            VStack(alignment: .leading, spacing: OrionSpacing.xs) {
                                                Text(star.title).lineLimit(2)
                                                Text(star.status.label).font(.caption).foregroundStyle(.secondary)
                                            }
                                            Spacer(minLength: 0)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(OrionSpacing.md)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    starMenu(star)
                                        .padding(.trailing, OrionSpacing.sm)
                                }
                                Divider()
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

    private func starGroups(_ stars: [StreamStar]) -> [String] {
        Array(Set(stars.map { $0.constellation ?? "Ungrouped" })).sorted { lhs, rhs in
            if lhs == "Ungrouped" { return false }
            if rhs == "Ungrouped" { return true }
            return lhs.localizedStandardCompare(rhs) == .orderedAscending
        }
    }

    private func starMenu(_ star: StreamStar) -> some View {
        Menu {
            Button("Rename") { renamingStarID = star.id; renameDraft = star.title }
            Menu("Move to Constellation") {
                Button("New Constellation…") { groupingStarID = star.id; groupDraft = "" }
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
        .accessibilityLabel("Options for \(star.title)")
    }

    private var starDetail: some View {
        ScrollView {
            if let stream = frame.visibleStream,
               let star = stream.stars.first(where: { $0.id == frame.openStarID }) {
                VStack(alignment: .leading, spacing: OrionSpacing.md) {
                    Button("Constellations", systemImage: "chevron.left") { frame.showConstellations() }
                        .buttonStyle(.plain)
                        .font(.caption)
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
                            let sent = await frame.sendStream(body, provider: nil, model: nil, starTaskID: star.id)
                            if sent { starReply = "" }
                        }
                    }
                    .disabled(starReply.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !stream.canSend)
                    if !stream.canSend {
                        Text(stream.blockedReason ?? "Orion can't answer right now.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(OrionSpacing.md)
            }
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
            Text(String(message.authorName.prefix(1)).uppercased())
                .font(.caption.bold())
                .frame(width: 32, height: 32)
                .background(message.isOrion ? Color.cyan.opacity(0.35) : Color.blue.opacity(0.35), in: Circle())
                .accessibilityHidden(true)
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
        switch self { case .working: "circle.dotted"; case .needs_you, .stuck: "exclamationmark.circle"; case .done: "checkmark.circle" }
    }
}
