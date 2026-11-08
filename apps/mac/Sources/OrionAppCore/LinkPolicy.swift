import Foundation

public enum LinkDecision: Equatable, Sendable {
    case loadInApp, openExternally, ignore
}

/// Decides where a main-frame navigation goes. Only Orion itself loads in the window.
public struct LinkPolicy: Sendable {
    public let appOrigin: URL

    public init(appOrigin: URL) {
        self.appOrigin = appOrigin
    }

    public func decide(_ url: URL) -> LinkDecision {
        switch url.scheme?.lowercased() {
        case "about", "blob", "data": .loadInApp
        case "http", "https": isSameOrigin(url, appOrigin) ? .loadInApp : .openExternally
        case "javascript", "file", nil: .ignore
        case "mailto", "tel": .openExternally
        default: .ignore
        }
    }
}
