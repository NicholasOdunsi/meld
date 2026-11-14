import Foundation

public struct StreamMessage: Identifiable, Equatable, Sendable {
    public let id: String
    public let authorName: String
    public let isOrion: Bool
    public let text: String
    public let createdAt: Date
    public let replyToID: String?
    public let delivery: String
}

public struct StreamModelChoice: Identifiable, Equatable, Sendable {
    public var id: String { provider }
    public let provider: String
    public let models: [String]
    public let defaultModel: String?
}

public struct StreamSnapshot: Equatable, Sendable {
    public let roomID: String
    public let projectID: String
    public let currentUserName: String
    public let orionBusy: Bool
    public let canSend: Bool
    public let blockedReason: String?
    public let defaultProvider: String?
    public let choices: [StreamModelChoice]
    public let messages: [StreamMessage]

    public static func decode(_ fields: [String: Any]) -> Self? {
        guard let roomID = fields["roomId"] as? String, !roomID.isEmpty,
              let projectID = fields["projectId"] as? String, !projectID.isEmpty,
              let currentUserName = fields["currentUserName"] as? String,
              let send = fields["send"] as? [String: Any] else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let plain = ISO8601DateFormatter()
        let messages = (fields["messages"] as? [[String: Any]] ?? []).compactMap { row -> StreamMessage? in
            guard let id = row["id"] as? String, !id.isEmpty,
                  let name = row["authorName"] as? String,
                  let kind = row["authorKind"] as? String, ["human", "orion"].contains(kind),
                  let text = row["text"] as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  let dateText = row["createdAt"] as? String,
                  let date = fractional.date(from: dateText) ?? plain.date(from: dateText) else { return nil }
            return StreamMessage(id: id, authorName: name, isOrion: kind == "orion", text: text,
                                 createdAt: date, replyToID: row["replyToId"] as? String,
                                 delivery: row["delivery"] as? String ?? "persisted")
        }.sorted { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt }
        let choices = (fields["choices"] as? [[String: Any]] ?? []).compactMap { row -> StreamModelChoice? in
            guard let provider = row["provider"] as? String, !provider.isEmpty else { return nil }
            return StreamModelChoice(provider: provider, models: row["models"] as? [String] ?? [],
                                     defaultModel: row["defaultModel"] as? String)
        }
        return Self(roomID: roomID, projectID: projectID, currentUserName: currentUserName,
                    orionBusy: fields["orionBusy"] as? Bool ?? false,
                    canSend: send["canSend"] as? Bool ?? false, blockedReason: send["reason"] as? String,
                    defaultProvider: fields["defaultProvider"] as? String,
                    choices: choices, messages: Array(messages.suffix(1_000)))
    }

    public func quote(for message: StreamMessage) -> String? {
        guard let id = message.replyToID, let source = messages.first(where: { $0.id == id }) else { return nil }
        let text = source.text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return "↱ \(source.authorName)  \(String(text.prefix(90)))\(text.count > 90 ? "…" : "")"
    }
}
