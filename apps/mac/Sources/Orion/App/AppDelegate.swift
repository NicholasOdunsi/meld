import AppKit
import OrionAppCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let appModel = AppModel(dependencies: .live)
    private var statusItemController: StatusItemController?
    private var hotkey: GlobalHotkey?
    private(set) var mainWindow: MainWindowController?
    private(set) var webController: WebViewController?
    private var notificationPresenter: NotificationPresenter?
    private var nativeBridge: NativeBridge?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let baseURL = AppConfig.baseURL(info: Bundle.main.infoDictionary, defaults: .standard)
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        let windowModel = WindowModel(defaults: .standard, appOrigin: baseURL)
        let presenter = NotificationPresenter(open: { [weak self] url in self?.mainWindow?.show(loading: url) })
        let bridge = NativeBridge(
            appOrigin: baseURL,
            isLookingAtOrion: { [weak self] in
                NotificationGate.shouldPresent(appIsActive: NSApp.isActive, windowIsKey: self?.mainWindow?.isKeyWindow ?? false) == false
            },
            presenter: presenter,
            shelf: appModel,
            askForShelfCode: { [weak self] in self?.webController?.evaluate("window.__orionNative?.requestShelfConnect()") }
        )
        notificationPresenter = presenter
        nativeBridge = bridge
        let web = WebViewController(model: windowModel, policy: LinkPolicy(appOrigin: baseURL), version: version, messageHandler: bridge)
        webController = web
        mainWindow = MainWindowController(model: windowModel, web: web)
        appModel.openInWindow = { [weak self] url in self?.mainWindow?.show(loading: url) }

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
