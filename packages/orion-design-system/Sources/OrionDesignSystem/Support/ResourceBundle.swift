import Foundation

/// Finds the design system's resources (fonts, logo strings).
///
/// SwiftPM's generated `Bundle.module` only checks next to the app bundle and the
/// absolute build path of the machine that compiled it, then traps. A shipped
/// `.app` keeps the resource bundle in `Contents/Resources`, and a CI-built app's
/// build path doesn't exist on the user's Mac — so `Bundle.module` would crash.
/// Look in the app's Resources first; fall back to `Bundle.module` only for
/// `swift test` / `swift run`, where the build path is real.
enum ResourceBundle {
    static let bundleName = "OrionDesignSystem_OrionDesignSystem.bundle"

    static let current: Bundle = {
        locate(in: [Bundle.main.resourceURL, Bundle.main.bundleURL]) ?? .module
    }()

    static func locate(in directories: [URL?]) -> Bundle? {
        for directory in directories.compactMap(\.self) {
            let candidate = directory.appending(path: bundleName, directoryHint: .isDirectory)
            if FileManager.default.fileExists(atPath: candidate.path()), let bundle = Bundle(url: candidate) {
                return bundle
            }
        }
        return nil
    }
}
