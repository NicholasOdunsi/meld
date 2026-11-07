import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let appModel = AppModel(dependencies: .live)
    private var statusItemController: StatusItemController?
    private var hotkey: GlobalHotkey?

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItemController = StatusItemController(appModel: appModel)
        let hotkey = GlobalHotkey { [appModel] in
            Task { await appModel.captureClipboard() }
        }
        hotkey.register()
        self.hotkey = hotkey
        Task { await appModel.start() }
    }
}
