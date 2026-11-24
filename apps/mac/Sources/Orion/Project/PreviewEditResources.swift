import Foundation

enum PreviewEditResources {
    /// SwiftPM puts the resource bundle next to the executable in a dev build and in Contents/Resources in the app.
    static func url(_ name: String) -> URL? {
        let roots = [Bundle.main.resourceURL, Bundle.main.bundleURL].compactMap { $0 }
        for root in roots {
            guard let bundle = Bundle(url: root.appendingPathComponent("OrionMac_Orion.bundle")),
                  let url = bundle.url(forResource: name, withExtension: nil, subdirectory: "PreviewEdit") else { continue }
            return url
        }
        return nil
    }

    static var overlayScript: String? {
        url("overlay.js").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
    }
}
