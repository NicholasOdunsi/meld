import Foundation

/// Which pages are safe to reopen at launch or from a notification click.
public enum RestorableURL {
    public static func restorable(_ url: URL?, appOrigin: URL) -> URL? {
        guard let url, isSameOrigin(url, appOrigin) else { return nil }
        let path = url.path()
        let isAuth = path == "/sign-in" || path.hasPrefix("/sign-in/") || path == "/auth" || path.hasPrefix("/auth/")
        return isAuth ? nil : url
    }

    public static func resolve(path: String, appOrigin: URL) -> URL? {
        guard path.hasPrefix("/"), !path.hasPrefix("//"),
              let url = URL(string: path, relativeTo: appOrigin)?.absoluteURL else { return nil }
        return restorable(url, appOrigin: appOrigin)
    }
}
