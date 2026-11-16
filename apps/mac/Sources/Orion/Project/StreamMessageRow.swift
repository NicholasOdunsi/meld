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
    /// Reassigns a human message after it has been sent.
    var changeStars: ((StreamStar?, String) -> Void)?
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
        .contextMenu {
            if let changeStars, !message.isOrion, message.delivery == "persisted" {
                let linked = stream.stars.filter { $0.followupMessageIDs.contains(message.id) }
                Menu("Move to Star") {
                    ForEach(stream.stars.filter { !linked.contains($0) }) { candidate in
                        Button(candidate.title) { changeStars(candidate, "move") }
                    }
                }
                if !linked.isEmpty {
                    Menu("Also show in Star") {
                        ForEach(stream.stars.filter { !linked.contains($0) }) { candidate in
                            Button(candidate.title) { changeStars(candidate, "add") }
                        }
                    }
                    Button("Make its own Star") { changeStars(nil, "own") }
                }
            }
        }
    }
    /// The Stars that show this message, including a reply shared by two threads.
    private var linkedStars: [StreamStar] {
        guard openStar != nil else { return [] }
        return stream.stars.filter { candidate in
            (message.isOrion && message.taskID == candidate.id)
                || candidate.followupMessageIDs.contains(message.id)
                || (message.isOrion && message.replyToID.map { candidate.followupMessageIDs.contains($0) } == true)
        }
    }

    /// Keep the selectable reply text separate so only Star links get a hand cursor.
    @ViewBuilder private var messageText: some View {
        if !linkedStars.isEmpty && (showsQuote || linkedStars.count > 1) {
            VStack(alignment: .leading, spacing: 0) {
                Text(message.text).textSelection(.enabled)
                HStack(spacing: OrionSpacing.sm) {
                    ForEach(linkedStars) { star in
                        Button { openStar?(star.id) } label: { starLink(for: star) }
                            .buttonStyle(.plain)
                            .pointerStyle(.link)
                            .accessibilityHint("Opens the Star \(star.title), \(star.status.label)")
                    }
                }
            }
        } else {
            Text(message.text).textSelection(.enabled)
        }
    }

    private func starLink(for star: StreamStar) -> Text {
        Text("\(Text(Image(systemName: star.status.symbol)).foregroundStyle(star.status.color)) \(Text(star.title).foregroundStyle(OrionColor.dayBreakBlue.color))")
    }
}
