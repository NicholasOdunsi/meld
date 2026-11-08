import Foundation

public func isSameOrigin(_ a: URL, _ b: URL) -> Bool {
    guard let schemeA = a.scheme?.lowercased(), let schemeB = b.scheme?.lowercased(),
          let hostA = a.host()?.lowercased(), let hostB = b.host()?.lowercased() else { return false }
    return schemeA == schemeB && hostA == hostB && effectivePort(a, scheme: schemeA) == effectivePort(b, scheme: schemeB)
}

private func effectivePort(_ url: URL, scheme: String) -> Int? {
    url.port ?? (scheme == "https" ? 443 : scheme == "http" ? 80 : nil)
}
