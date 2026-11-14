import WebKit
import OrionAppCore
import OrionDesignSystem
import SwiftUI

enum ProjectPanel: Equatable { case todo, canvas, artifacts }

struct ProjectScreen: View {
    @Bindable var frame: FrameModel
    let webView: WKWebView

    var body: some View {
        GeometryReader { geometry in
            HStack(spacing: 0) {
                VStack(spacing: 0) {
                    stream
                    ChatComposer(frame: frame)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                if frame.projectPanel == .todo {
                    todo
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
    }

    private var showsWeb: Bool { frame.projectPanel == .canvas || frame.projectPanel == .artifacts }
    private var divider: some View {
        Rectangle().fill(.primary.opacity(FrameMetrics.columnDividerOpacity))
            .frame(width: FrameMetrics.columnDividerWidth)
    }

    private var todo: some View {
        VStack {
            Spacer()
            Text("Ask Orion for something and it will show up here.")
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, OrionSpacing.md)
            Spacer()
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
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
