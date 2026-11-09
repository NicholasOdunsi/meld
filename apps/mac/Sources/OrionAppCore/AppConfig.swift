import Foundation

/// Where Orion Online lives. Info.plist sets it; a UserDefaults override lets
/// developers point a local build at `pnpm dev`.
public enum AppConfig {
    public static let infoKey = "OrionBaseURL"
    public static let overrideKey = "OrionBaseURLOverride"
    public static let fallbackBaseURL: URL = {
        guard let url = URL(string: "https://orion-workspace-phi.vercel.app") else {
            preconditionFailure("The built-in Orion address is invalid")
        }
        return url
    }()

    /// Set by apps/mac/scripts/preview.sh in the "Orion Preview" bundle: a
    /// local copy for trying UI changes, which must not run the Shelf (its
    /// outbox folder is shared with the real app) or look for updates.
    public static let previewKey = "OrionPreview"

    public static func isPreview(info: [String: Any]?) -> Bool {
        info?[previewKey] as? Bool == true
    }

    public static func baseURL(info: [String: Any]?, defaults: UserDefaults) -> URL {
        if let override = defaults.string(forKey: overrideKey).flatMap(webURL) { return override }
        if let configured = (info?[infoKey] as? String).flatMap(webURL) { return configured }
        return fallbackBaseURL
    }

    private static func webURL(_ text: String) -> URL? {
        guard let url = URL(string: text), let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http", url.host() != nil else { return nil }
        return url
    }
}
