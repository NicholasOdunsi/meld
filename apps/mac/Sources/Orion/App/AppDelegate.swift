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
        mainWindow?.onVisibilityChange = { visible in
            NSApp.setActivationPolicy(visible ? .regular : .accessory)
        }
        appModel.showWindow = { [weak self] in self?.openOrion() }
        if LaunchContext.shouldShowWindowAtLaunch(launchedAsLoginItem: Self.launchedAsLoginItem()) {
            // The app starts as a regular (Dock) app, so macOS activates it normally at launch.
            mainWindow?.show()
        } else {
            NSApp.setActivationPolicy(.accessory)
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        mainWindow?.show()
        return false
    }

    func openOrion() {
        mainWindow?.show()
    }

    /// Login items are started with an open-application Apple event tagged `keyAELaunchedAsLogInItem`.
    /// `NSApplication.launchIsDefaultUserInfoKey` is deliberately not used: it is also false when saved
    /// state is restored, which would hide the window on a normal launch.
    private static func launchedAsLoginItem() -> Bool {
        let event = NSAppleEventManager.shared().currentAppleEvent
        return event?.eventID == kAEOpenApplication
            && event?.paramDescriptor(forKeyword: keyAEPropData)?.enumCodeValue == keyAELaunchedAsLogInItem
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}
