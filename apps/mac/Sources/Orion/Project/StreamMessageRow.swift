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
                if !message.text.isEmpty { messageText }
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
    /// The Star this Orion message started, when links are enabled (not inside a thread).
    private var star: StreamStar? {
        guard openStar != nil, message.isOrion, let taskID = message.taskID else { return nil }
        return stream.stars.first { $0.id == taskID }
    }

    /// The reply text, with the Star as a small inline link at the end of it.
    @ViewBuilder private var messageText: some View {
        if let star {
            Text("\(Text(message.text))  \(starLink(for: star))")
                .textSelection(.enabled)
                .environment(\.openURL, OpenURLAction { url in
                    guard let id = StarLink.starID(from: url) else { return .systemAction }
                    openStar?(id)
                    return .handled
                })
                .accessibilityHint("Opens the Star \(star.title), \(star.status.label)")
        } else {
            Text(message.text).textSelection(.enabled)
        }
    }

    private func starLink(for star: StreamStar) -> Text {
        var title = AttributedString(star.title)
        title.link = StarLink.url(for: star.id)
        title.foregroundColor = OrionColor.dayBreakBlue.color
        return Text("\(Text(Image(systemName: star.status.symbol)).foregroundStyle(star.status.color)) \(Text(title))")
    }
}
