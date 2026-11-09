import Foundation

/// Messages the Orion website sends to the app (wire format v1, see apps/web/src/features/native/bridge.ts).
public enum BridgeMessage: Equatable, Sendable {
    case ready(workspaceID: UUID?)
    case notify(title: String, body: String, path: String)
    case shelfConnectCode(String)
    case shelfConnectFailed(String)
    case frame(FrameSnapshot)

    static let titleLimit = 120
    static let bodyLimit = 300

    public static func decode(_ body: Any) -> BridgeMessage? {
        guard let fields = body as? [String: Any], (fields["v"] as? Int) == 1, let type = fields["type"] as? String else { return nil }
        switch type {
        case "ready":
            return .ready(workspaceID: (fields["workspaceId"] as? String).flatMap(UUID.init(uuidString:)))
        case "notify":
            guard let title = nonEmpty(fields["title"]), let body = nonEmpty(fields["body"]), let path = nonEmpty(fields["path"]) else { return nil }
            return .notify(title: String(title.prefix(titleLimit)), body: String(body.prefix(bodyLimit)), path: path)
        case "shelfConnectCode":
            return nonEmpty(fields["code"]).map(BridgeMessage.shelfConnectCode)
        case "shelfConnectFailed":
            return nonEmpty(fields["message"]).map(BridgeMessage.shelfConnectFailed)
        case "frame":
            return FrameSnapshot.decode(fields).map(BridgeMessage.frame)
        default:
            return nil
        }
    }

    private static func nonEmpty(_ value: Any?) -> String? {
        guard let text = value as? String, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return text
    }
}
