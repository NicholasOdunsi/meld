import Foundation

/// The address behind an inline Star link in a chat message, so a tap on the
/// link can be turned back into "open this Star".
public enum StarLink {
    public static let scheme = "orion-star"

    public static func url(for starID: String) -> URL {
        var components = URLComponents()
        components.scheme = scheme
        components.host = "star"
        components.path = "/" + starID
        return components.url!
    }

    public static func starID(from url: URL) -> String? {
        guard url.scheme == scheme else { return nil }
        let id = url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return id.isEmpty ? nil : id
    }
}
