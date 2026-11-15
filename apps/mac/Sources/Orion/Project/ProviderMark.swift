import AppKit
import SwiftUI

/// The small logo for a model provider (Claude, Codex, DeepSeek). The same
/// marks the web app uses; a provider without one falls back to its name.
struct ProviderMark: View {
    let provider: String
    var size: CGFloat = 14

    var body: some View {
        if let image = Self.image(for: provider) {
            Image(nsImage: image)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .accessibilityLabel(provider.capitalized)
        } else {
            Text(provider.capitalized)
        }
    }

    private static var cache: [String: NSImage] = [:]

    @MainActor
    static func image(for provider: String) -> NSImage? {
        let key = provider.lowercased()
        if let cached = cache[key] { return cached }
        // SwiftPM puts the resource bundle next to the executable in a dev
        // build and in Contents/Resources inside the packaged app.
        let roots = [Bundle.main.resourceURL, Bundle.main.bundleURL].compactMap { $0 }
        for root in roots {
            guard let bundle = Bundle(url: root.appendingPathComponent("OrionMac_Orion.bundle")),
                  let url = bundle.url(forResource: key, withExtension: "svg", subdirectory: "ProviderMarks"),
                  let image = NSImage(contentsOf: url) else { continue }
            cache[key] = image
            return image
        }
        return nil
    }
}
