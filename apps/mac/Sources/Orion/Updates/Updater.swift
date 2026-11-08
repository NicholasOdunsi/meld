import Sparkle

/// Sparkle checks GitHub Releases at launch and every 6 hours, downloads in the
/// background, and asks once to restart. Unsigned updates are refused.
@MainActor
final class Updater {
    private let controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: nil, userDriverDelegate: nil)

    func checkForUpdates() {
        controller.checkForUpdates(nil)
    }
}
