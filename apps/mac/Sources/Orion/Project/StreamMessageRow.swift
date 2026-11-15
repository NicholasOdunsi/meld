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
    /// Space between the avatar and the text. Tighter in the narrow Star panel.
    var avatarGap = OrionSpacing.sm

    var body: some View {
        HStack(alignment: .top, spacing: avatarGap) {
            ChatAvatar(isOrion: message.isOrion, size: 28)
            VStack(alignment: .leading, spacing: 2) {
                if showsQuote, let quote = stream.quote(for: message) {
                    Text(quote).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                HStack(spacing: OrionSpacing.xs) {
                    Text(message.authorName)
                        .fontWeight(.semibold)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .layoutPriority(0)
                    if message.isOrion {
                        Text("AI").font(.caption2).foregroundStyle(.secondary)
                            .lineLimit(1).fixedSize().layoutPriority(1)
                    }
                    Text(message.createdAt, style: .time).font(.caption).foregroundStyle(.secondary)
                        .lineLimit(1).fixedSize().layoutPriority(1)
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
                    StarReplyLink(
                        countText: stream.thread(for: star).replyCountLabel,
                        statusLabel: star.status.label,
                        statusColor: star.status.color,
                        accessibilityLabel: "Open Star: \(star.title), \(star.status.label)"
                    ) { openStar(star.id) }
                    .padding(.top, OrionSpacing.xxs)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// The Slack-style "1 reply" link under Orion's answer: a small Orion chip,
/// the reply count in the accent colour, then the Star's status, quieter.
private struct StarReplyLink: View {
    let countText: String
    let statusLabel: String
    let statusColor: Color
    let accessibilityLabel: String
    let action: () -> Void

    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: OrionSpacing.xs) {
                ChatAvatar(isOrion: true, size: 18)
                Text(countText)
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.accentColor)
                    .underline(hovering)
                Text(statusLabel)
                    .foregroundStyle(statusColor.opacity(0.85))
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .opacity(hovering ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .font(.caption)
            .lineLimit(1)
            .padding(.horizontal, OrionSpacing.xs)
            .padding(.vertical, OrionSpacing.xxs)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(.primary.opacity(hovering ? 0.07 : 0))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { inside in
            hovering = inside
            if inside { NSCursor.pointingHand.push() } else { NSCursor.pop() }
        }
        .onDisappear { if hovering { NSCursor.pop(); hovering = false } }
        .padding(.leading, -OrionSpacing.xs)
        .accessibilityLabel(accessibilityLabel)
    }
}
