import CoreGraphics
import Foundation

public struct StreamScreen: Identifiable, Equatable, Sendable {
    public enum State: String, Sendable { case building, built, failed }
    public let id: String
    public let name: String
    public let state: State
    public let versionID: String?
    public let formFactor: String
    public let createdAt: Date
    public let updating: Bool

    public init(id: String, name: String, state: State, versionID: String?, formFactor: String,
                createdAt: Date, updating: Bool) {
        self.id = id; self.name = name; self.state = state; self.versionID = versionID
        self.formFactor = formFactor; self.createdAt = createdAt; self.updating = updating
    }

    public var cacheKey: String? { versionID.map { "\(id)-\($0)" } }
    public var pixelSize: CGSize { Self.pixelSize(formFactor: formFactor) }

    public static func pixelSize(formFactor: String) -> CGSize {
        switch formFactor {
        case "mobile": CGSize(width: 390, height: 844)
        case "tablet": CGSize(width: 820, height: 1180)
        default: CGSize(width: 1280, height: 800)
        }
    }
}

public struct StreamActivity: Identifiable, Equatable, Sendable {
    public enum Phase: String, Sendable {
        case reading, replying, designing, offline, needs_signin, limit_reached, failed
    }
    public let taskID: String
    public let starID: String?
    public let phase: Phase
    public let screenName: String?
    public var id: String { taskID }

    public init(taskID: String, starID: String?, phase: Phase, screenName: String?) {
        self.taskID = taskID; self.starID = starID; self.phase = phase; self.screenName = screenName
    }

    public func line() -> String {
        switch phase {
        case .reading: "Orion is reading…"
        case .replying: "Orion is replying…"
        case .designing: screenName.map { "Designing \($0)…" } ?? "Designing the screen…"
        case .offline: "Your Mac is offline. Orion will answer when it's back."
        case .needs_signin: "Sign in to your AI tool on your Mac so Orion can answer."
        case .limit_reached: "Your AI tool hit its usage limit."
        case .failed: "Orion couldn't answer."
        }
    }
}

public enum StreamTimelineItem: Identifiable, Equatable, Sendable {
    case message(StreamMessage)
    case screen(StreamScreen)

    public var id: String {
        switch self {
        case .message(let message): "message:\(message.id)"
        case .screen(let screen): "screen:\(screen.id)"
        }
    }
    public var date: Date {
        switch self {
        case .message(let message): message.createdAt
        case .screen(let screen): screen.createdAt
        }
    }
}

public struct ScreenDocument: Equatable, Sendable {
    public let roomID: String
    public let screenID: String
    public let versionID: String
    public let formFactor: String
    public let html: String
    public var cacheKey: String { "\(screenID)-\(versionID)" }

    public init(roomID: String, screenID: String, versionID: String, formFactor: String, html: String) {
        self.roomID = roomID; self.screenID = screenID; self.versionID = versionID
        self.formFactor = formFactor; self.html = html
    }
}
