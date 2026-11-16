import Foundation

public enum StarRouteChoice: Equatable, Sendable {
    case new
    case `continue`(id: String, title: String)
    case ask(id: String, title: String)

    public static func parse(_ value: Any?) -> StarRouteChoice {
        guard let fields = value as? [String: Any], fields["status"] as? String == "route" else { return .new }
        let decision = fields["decision"] as? String
        guard decision == "continue" || decision == "ask",
              let id = fields["starTaskId"] as? String,
              UUID(uuidString: id) != nil,
              let title = fields["title"] as? String, !title.isEmpty else { return .new }
        return decision == "continue" ? .continue(id: id, title: title) : .ask(id: id, title: title)
    }
}
