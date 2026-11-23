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
    /// The Star whose reply asked for this screen, when known.
    public let starID: String?

    public init(id: String, name: String, state: State, versionID: String?, formFactor: String,
                createdAt: Date, updating: Bool, starID: String? = nil) {
        self.id = id; self.name = name; self.state = state; self.versionID = versionID
        self.formFactor = formFactor; self.createdAt = createdAt; self.updating = updating; self.starID = starID
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
    public let retryable: Bool
    public var id: String { taskID }

    public init(taskID: String, starID: String?, phase: Phase, screenName: String?, retryable: Bool = false) {
        self.taskID = taskID; self.starID = starID; self.phase = phase; self.screenName = screenName
        self.retryable = retryable
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
    /// Three or more screens made together, shown as one card.
    case screenGroup([StreamScreen])

    public var id: String {
        switch self {
        case .message(let message): "message:\(message.id)"
        case .screen(let screen): "screen:\(screen.id)"
        case .screenGroup(let screens): "screens:\(screens.first?.id ?? "")"
        }
    }
    public var date: Date {
        switch self {
        case .message(let message): message.createdAt
        case .screen(let screen): screen.createdAt
        case .screenGroup(let screens): screens.first?.createdAt ?? .distantPast
        }
    }
    /// The `.id` the main chat gives each row, used to scroll to the last one.
    public var scrollID: String {
        switch self {
        case .message(let message): message.id
        case .screen(let screen): "screen:\(screen.id)"
        case .screenGroup(let screens): "screens:\(screens.first?.id ?? "")"
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
