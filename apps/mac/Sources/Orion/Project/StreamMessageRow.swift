import OrionAppCore
import OrionDesignSystem
import SwiftUI

/// One chat message, as shown in the main project chat and in a Star thread.
struct StreamMessageRow: View {
    let message: StreamMessage
    let stream: StreamSnapshot
    /// Shows the "↱ who said what" line above replies. Off inside a thread,
    /// where the thread itself shows what is being answered.
    var showsQuote = true
    /// Opens a Star from Orion's reply. Nil hides the Star link (inside a thread).
    var openStar: ((String) -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: OrionSpacing.sm) {
            ChatAvatar(isOrion: message.isOrion, size: 28)
            VStack(alignment: .leading, spacing: OrionSpacing.xs) {
                if showsQuote, let quote = stream.quote(for: message) {
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
                if let openStar, message.isOrion, let taskID = message.taskID,
                   let star = stream.stars.first(where: { $0.id == taskID }) {
                    Button { openStar(star.id) } label: {
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
