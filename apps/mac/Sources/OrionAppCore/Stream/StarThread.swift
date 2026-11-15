import Foundation

/// One Star read as a thread: the request that started it, then everything
/// said inside it, oldest first.
public struct StarThread: Equatable, Sendable {
    /// The request message, when it is still in the loaded part of the chat.
    public let request: StreamMessage?
    /// Orion's answer to the request, follow-ups, and Orion's answers to them.
    public let replies: [StreamMessage]
}

public extension StreamSnapshot {
    /// Ids of every message someone sent from inside a Star.
    var starFollowupMessageIDs: Set<String> {
        Set(stars.flatMap(\.followupMessageIDs))
    }

    /// The main chat: everything except what was said inside a Star after
    /// its request (follow-ups and Orion's answers to them). The request and
    /// Orion's first answer stay, since they started the Star in the chat.
    var mainChatMessages: [StreamMessage] {
        let followups = starFollowupMessageIDs
        guard !followups.isEmpty else { return messages }
        return messages.filter { !Self.belongs($0, toFollowups: followups) }
    }

    /// The thread for one Star. Uses the same follow-up rule as
    /// `mainChatMessages`, so the two lists can never disagree about which
    /// messages were said inside a Star.
    func thread(for star: StreamStar) -> StarThread {
        let followups = Set(star.followupMessageIDs)
        let replies = messages.filter { message in
            guard message.id != star.sourceMessageID else { return false }
            return (message.isOrion && message.taskID == star.id)
                || Self.belongs(message, toFollowups: followups)
        }
        return StarThread(request: messages.first { $0.id == star.sourceMessageID }, replies: replies)
    }

    private static func belongs(_ message: StreamMessage, toFollowups followups: Set<String>) -> Bool {
        if followups.contains(message.id) { return true }
        guard message.isOrion, let source = message.replyToID else { return false }
        return followups.contains(source)
    }
}
