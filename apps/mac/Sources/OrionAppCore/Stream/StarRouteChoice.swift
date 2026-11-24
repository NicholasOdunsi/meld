import Foundation

public enum StarRouteChoice: Equatable, Sendable {
    case new
    case `continue`(id: String, title: String)
    case ask(id: String, title: String)
    case build(starID: String?)
    case unsure(starID: String?)

    public static func parse(_ value: Any?) -> StarRouteChoice {
        guard let fields = value as? [String: Any], fields["status"] as? String == "route" else { return .new }
        let decision = fields["decision"] as? String
        let matchedID = (fields["starTaskId"] as? String).flatMap { UUID(uuidString: $0) == nil ? nil : $0 }
        switch fields["intent"] as? String {
        case "build": return .build(starID: decision == "continue" ? matchedID : nil)
        case "unsure": return .unsure(starID: decision == "continue" ? matchedID : nil)
        default: break
        }
        guard decision == "continue" || decision == "ask",
              let id = fields["starTaskId"] as? String,
              UUID(uuidString: id) != nil,
              let title = fields["title"] as? String, !title.isEmpty else { return .new }
        return decision == "continue" ? .continue(id: id, title: title) : .ask(id: id, title: title)
    }
}
