import Foundation

public func isSameOrigin(_ a: URL, _ b: URL) -> Bool {
    guard let schemeA = a.scheme?.lowercased(), let schemeB = b.scheme?.lowercased(),
          let hostA = a.host()?.lowercased(), let hostB = b.host()?.lowercased() else { return false }
    return schemeA == schemeB && hostA == hostB && effectivePort(a, scheme: schemeA) == effectivePort(b, scheme: schemeB)
}

private func effectivePort(_ url: URL, scheme: String) -> Int? {
    url.port ?? (scheme == "https" ? 443 : scheme == "http" ? 80 : nil)
}

/// Checks a WebKit security origin (where port 0 means "the scheme's default") against the app's origin.
public func isSameOrigin(scheme: String, host: String, port: Int, as appOrigin: URL) -> Bool {
    guard let appScheme = appOrigin.scheme?.lowercased(), let appHost = appOrigin.host()?.lowercased() else { return false }
    let schemeLower = scheme.lowercased()
    let resolvedPort = port == 0 ? defaultPort(for: schemeLower) : port
    return schemeLower == appScheme && host.lowercased() == appHost && resolvedPort == effectivePort(appOrigin, scheme: appScheme)
}

private func defaultPort(for scheme: String) -> Int? {
    scheme == "https" ? 443 : scheme == "http" ? 80 : nil
}
