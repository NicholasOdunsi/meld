import Foundation

public struct StreamMessage: Identifiable, Equatable, Sendable {
    public struct Attachment: Identifiable, Equatable, Sendable {
        public let id: String
        public let name: String
    }

    public let id: String
    public let authorName: String
    public let isOrion: Bool
    public let text: String
    public let attachments: [Attachment]
    public let createdAt: Date
    public let replyToID: String?
    public let delivery: String
    public let taskID: String?
}

public struct StreamStar: Identifiable, Equatable, Sendable {
    public enum Status: String, Sendable { case working, needs_you, stuck, done }
    public let id: String
    public let sourceMessageID: String
    public let title: String
    public let status: Status
    public let constellation: String?
    public let createdAt: Date
    public let followupMessageIDs: [String]
}

public struct StreamModelChoice: Identifiable, Equatable, Sendable {
    public var id: String { provider }
    public let provider: String
    public let models: [String]
    public let defaultModel: String?
}

public struct StreamArtifact: Identifiable, Equatable, Sendable {
    public enum Kind: String, Sendable, CaseIterable { case prd, prototype, screen, inspiration, file }
    public let id: String
    public let kind: Kind
    public let title: String
    public let href: String?
    public let previewURL: String?
    public let mimeType: String?
    public let starID: String?
    public let createdAt: Date?
}

public extension StreamArtifact.Kind {
    var label: String {
        switch self { case .prd: "PRD"; case .prototype: "Prototype"; case .screen: "Screen"; case .inspiration: "Inspiration"; case .file: "File" }
    }
    var symbol: String {
        switch self { case .prd: "doc.text"; case .prototype: "play.rectangle"; case .screen: "rectangle.on.rectangle"; case .inspiration: "photo"; case .file: "paperclip" }
    }
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
    public let stars: [StreamStar]
    public let artifacts: [StreamArtifact]
    public let screens: [StreamScreen]
    public let activity: [StreamActivity]
    public let constellations: [String]

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
                  let text = row["text"] as? String,
                  let dateText = row["createdAt"] as? String,
                  let date = fractional.date(from: dateText) ?? plain.date(from: dateText) else { return nil }
            let attachments = (row["attachments"] as? [[String: Any]] ?? []).compactMap { item -> StreamMessage.Attachment? in
                guard let id = item["id"] as? String, !id.isEmpty,
                      let name = item["name"] as? String, !name.isEmpty else { return nil }
                return .init(id: id, name: name)
            }
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !attachments.isEmpty else { return nil }
            return StreamMessage(id: id, authorName: name, isOrion: kind == "orion", text: text,
                                 attachments: attachments,
                                 createdAt: date, replyToID: row["replyToId"] as? String,
                                 delivery: row["delivery"] as? String ?? "persisted",
                                 taskID: row["taskId"] as? String)
        }.sorted { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt }
        let stars = (fields["stars"] as? [[String: Any]] ?? []).compactMap { row -> StreamStar? in
            guard let id = row["id"] as? String, !id.isEmpty,
                  let source = row["sourceMessageId"] as? String, !source.isEmpty,
                  let title = row["title"] as? String, !title.isEmpty,
                  let statusText = row["status"] as? String, let status = StreamStar.Status(rawValue: statusText),
                  let dateText = row["createdAt"] as? String,
                  let date = fractional.date(from: dateText) ?? plain.date(from: dateText) else { return nil }
            return StreamStar(id: id, sourceMessageID: source, title: title, status: status,
                              constellation: row["constellation"] as? String, createdAt: date,
                              followupMessageIDs: row["followupMessageIds"] as? [String] ?? [])
        }.sorted { $0.createdAt > $1.createdAt }
        let choices = (fields["choices"] as? [[String: Any]] ?? []).compactMap { row -> StreamModelChoice? in
            guard let provider = row["provider"] as? String, !provider.isEmpty else { return nil }
            return StreamModelChoice(provider: provider, models: row["models"] as? [String] ?? [],
                                     defaultModel: row["defaultModel"] as? String)
        }
        let artifacts = (fields["artifacts"] as? [[String: Any]] ?? []).compactMap { row -> StreamArtifact? in
            guard let id = row["id"] as? String, !id.isEmpty,
                  let title = row["title"] as? String, !title.isEmpty,
                  let kindText = row["kind"] as? String,
                  let kind = StreamArtifact.Kind(rawValue: kindText) else { return nil }
            let date = (row["createdAt"] as? String).flatMap { fractional.date(from: $0) ?? plain.date(from: $0) }
            return StreamArtifact(id: id, kind: kind, title: title, href: row["href"] as? String,
                                  previewURL: row["previewUrl"] as? String, mimeType: row["mimeType"] as? String,
                                  starID: row["starId"] as? String, createdAt: date)
        }
        let screens = (fields["screens"] as? [[String: Any]] ?? []).compactMap { row -> StreamScreen? in
            guard let id = row["id"] as? String, !id.isEmpty,
                  let name = row["name"] as? String,
                  let stateText = row["state"] as? String, let state = StreamScreen.State(rawValue: stateText),
                  let dateText = row["createdAt"] as? String,
                  let date = fractional.date(from: dateText) ?? plain.date(from: dateText) else { return nil }
            return StreamScreen(id: id, name: name, state: state, versionID: row["versionId"] as? String,
                                formFactor: row["formFactor"] as? String ?? "mobile", createdAt: date,
                                updating: row["updating"] as? Bool ?? false)
        }.sorted { $0.createdAt == $1.createdAt ? $0.id < $1.id : $0.createdAt < $1.createdAt }
        let activity = (fields["activity"] as? [[String: Any]] ?? []).compactMap { row -> StreamActivity? in
            guard let taskID = row["taskId"] as? String, !taskID.isEmpty,
                  let phaseText = row["phase"] as? String, let phase = StreamActivity.Phase(rawValue: phaseText) else { return nil }
            return StreamActivity(taskID: taskID, starID: row["starId"] as? String, phase: phase,
                                  screenName: row["screenName"] as? String,
                                  retryable: row["retryable"] as? Bool ?? false)
        }
        return Self(roomID: roomID, projectID: projectID, currentUserName: currentUserName,
                    orionBusy: fields["orionBusy"] as? Bool ?? false,
                    canSend: send["canSend"] as? Bool ?? false, blockedReason: send["reason"] as? String,
                    defaultProvider: fields["defaultProvider"] as? String,
                    choices: choices, messages: Array(messages.suffix(1_000)), stars: stars, artifacts: artifacts,
                    screens: screens, activity: activity,
                    constellations: fields["constellations"] as? [String] ?? [])
    }

    /// Three or more screens made close together read as one group.
    public static let screenGroupMinimum = 3
    /// How far apart (seconds) two screens may be and still belong to the same group.
    public static let screenGroupWindow: TimeInterval = 120

    private var screenItems: [StreamTimelineItem] {
        var clusters: [[StreamScreen]] = []
        for screen in screens {
            if let last = clusters.last?.last,
               screen.createdAt.timeIntervalSince(last.createdAt) <= Self.screenGroupWindow,
               !messages.contains(where: { !$0.isOrion && $0.createdAt > last.createdAt && $0.createdAt < screen.createdAt }) {
                clusters[clusters.count - 1].append(screen)
            } else {
                clusters.append([screen])
            }
        }
        return clusters.flatMap { cluster -> [StreamTimelineItem] in
            cluster.count >= Self.screenGroupMinimum ? [.screenGroup(cluster)] : cluster.map(StreamTimelineItem.screen)
        }
    }

    public var mainChatTimeline: [StreamTimelineItem] {
        let items = mainChatMessages.map(StreamTimelineItem.message) + screenItems
        return items.sorted { $0.date == $1.date ? $0.id < $1.id : $0.date < $1.date }
    }

    public func activity(forStar starID: String?) -> StreamActivity? {
        guard let starID else { return activity.first { $0.starID == nil } }
        return activity.first { $0.starID == starID || $0.taskID == starID }
    }

    public func quote(for message: StreamMessage) -> String? {
        guard let id = message.replyToID, let source = messages.first(where: { $0.id == id }) else { return nil }
        let text = source.text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return "↱ \(source.authorName)  \(String(text.prefix(90)))\(text.count > 90 ? "…" : "")"
    }
}
