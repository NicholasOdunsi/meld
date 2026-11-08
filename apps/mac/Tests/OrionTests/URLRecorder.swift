import Foundation

/// Collects URLs the model asks to open (a class, so a @MainActor closure can append).
@MainActor
final class URLRecorder {
    var urls: [URL] = []
}
