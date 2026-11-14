import OrionAppCore
import OrionDesignSystem
import SwiftUI

enum ProjectPanel: Equatable { case todo, canvas, artifacts }

struct ProjectScreen: View {
    @Bindable var frame: FrameModel

    var body: some View {
        VStack(spacing: 0) {
            header
            HStack(spacing: 0) {
                if frame.projectPanel != .canvas && frame.projectPanel != .artifacts {
                    VStack(spacing: 0) {
                        stream
                        ChatComposer(frame: frame)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
                if frame.projectPanel == .todo {
                    todo
                        .frame(width: 310)
                        .frame(maxHeight: .infinity)
                        .glassEffect(.regular.tint(.black.opacity(0.2)))
                }
            }
        }
        .background(frame.projectPanel == .canvas || frame.projectPanel == .artifacts ? Color.clear : Color.black.opacity(0.18))
    }

    private var header: some View {
        HStack(spacing: OrionSpacing.sm) {
            if let project = frame.currentProject {
                ProjectMark(project: project, revision: frame.logoRevision)
                Text(project.name).font(.headline).lineLimit(1)
            }
            Spacer()
            panelButton("To-do", icon: "checklist", panel: .todo)
            panelButton("Canvas", icon: "scribble.variable", panel: .canvas)
            panelButton("Artifacts", icon: "doc.on.doc", panel: .artifacts)
        }
        .padding(.horizontal, OrionSpacing.md)
        .frame(height: 48)
        .glassEffect(.regular)
    }

    private func panelButton(_ title: String, icon: String, panel: ProjectPanel) -> some View {
        Button { frame.togglePanel(panel) } label: {
            Image(systemName: icon).frame(width: 32, height: 32)
        }
        .buttonStyle(.plain)
        .help(title)
        .accessibilityLabel(title)
        .foregroundStyle(frame.projectPanel == panel ? .primary : .secondary)
    }

    private var todo: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            Text("To-do").font(.headline)
            Spacer()
            Text("Ask Orion for something and it will show up here.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
            Spacer()
        }
        .padding(OrionSpacing.md)
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
                Text(message.text).textSelection(.enabled)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
