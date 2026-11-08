import AppKit
import OrionAppCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let appModel = AppModel(dependencies: .live)
    private var statusItemController: StatusItemController?
    private var hotkey: GlobalHotkey?
    private(set) var mainWindow: MainWindowController?
    private(set) var webController: WebViewController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let baseURL = AppConfig.baseURL(info: Bundle.main.infoDictionary, defaults: .standard)
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let windowModel = WindowModel(defaults: .standard, appOrigin: baseURL)
        let web = WebViewController(model: windowModel, policy: LinkPolicy(appOrigin: baseURL), version: version, messageHandler: nil)
        webController = web
        mainWindow = MainWindowController(model: windowModel, web: web)

        statusItemController = StatusItemController(appModel: appModel)
        let hotkey = GlobalHotkey { [appModel] in
            Task { await appModel.captureClipboard() }
        }
        hotkey.register()
        self.hotkey = hotkey
        Task { await appModel.start() }
        mainWindow?.show()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}
