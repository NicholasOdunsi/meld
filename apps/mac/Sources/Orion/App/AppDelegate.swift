import AppKit
import OrionAppCore
import ShelfCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    let appModel: AppModel
    let frameModel = FrameModel()
    let inspirationModel: InspirationModel
    let tasteModel: TasteModel
    private var statusItemController: StatusItemController?
    private var hotkey: GlobalHotkey?
    private(set) var mainWindow: MainWindowController?
    private(set) var webController: WebViewController?
    private var notificationPresenter: NotificationPresenter?
    private var nativeBridge: NativeBridge?
    private let updater = Updater()
    /// The local "Orion Preview" copy (apps/mac/scripts/preview.sh).
    private let isPreview: Bool

    override init() {
        let appModel = AppModel(dependencies: .live)
        let isPreview = AppConfig.isPreview(info: Bundle.main.infoDictionary)
        let libraryStore = LibraryStore(
            client: { appModel.libraryClient() },
            token: { appModel.libraryToken() },
            cache: LibraryCache(directory: isPreview
                ? LibraryCache.defaultDirectory.deletingLastPathComponent().appending(path: "preview-inspiration-cache")
                : LibraryCache.defaultDirectory)
        )
        libraryStore.onUnauthorized = { appModel.libraryUnauthorized() }
        let inspiration = InspirationModel(store: libraryStore, thumbnails: ThumbnailCache())
        let tasteStore = TasteStore(
            client: { appModel.libraryClient() },
            token: { appModel.libraryToken() },
            cache: TasteCache(directory: isPreview
                ? TasteCache.defaultDirectory.deletingLastPathComponent().appending(path: "preview-taste-cache")
                : TasteCache.defaultDirectory)
        )
        tasteStore.onUnauthorized = { appModel.libraryUnauthorized() }
        let taste = TasteModel(store: tasteStore, inspiration: inspiration)
        appModel.onUploadsFinished = { Task { await libraryStore.reload() } }
        self.appModel = appModel
        self.inspirationModel = inspiration
        self.tasteModel = taste
        self.isPreview = isPreview
        super.init()
    }

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
            askForShelfCode: { [weak self] in self?.webController?.evaluate("window.__orionNative?.requestShelfConnect()") },
            onFrame: { [frameModel] snapshot in frameModel.update(snapshot) }
        )
        notificationPresenter = presenter
        nativeBridge = bridge
        let web = WebViewController(model: windowModel, policy: LinkPolicy(appOrigin: baseURL), version: version, messageHandler: bridge)
        webController = web
        frameModel.commander = web
        web.onURLChange = { [frameModel] url in
            if FramePages.isOutsideFrame(url) { frameModel.pageDidLeaveFrame() }
        }
        mainWindow = MainWindowController(
            model: windowModel,
            frame: frameModel,
            inspiration: inspirationModel,
            taste: tasteModel,
            appModel: appModel,
            web: web,
            reconnect: { [weak web] in web?.reload() }
        )
        appModel.openInWindow = { [weak self] url in self?.mainWindow?.show(loading: url) }

        if !isPreview {
            statusItemController = StatusItemController(appModel: appModel)
            let hotkey = GlobalHotkey { [appModel] in
                Task { await appModel.captureClipboard() }
            }
            hotkey.register()
            self.hotkey = hotkey
            Task { await appModel.start() }
        }
        mainWindow?.onVisibilityChange = { visible in
            NSApp.setActivationPolicy(visible ? .regular : .accessory)
        }
        appModel.showWindow = { [weak self] in self?.openOrion() }
        appModel.checkForUpdates = { [updater] in updater.checkForUpdates() }
        if isPreview || LaunchContext.shouldShowWindowAtLaunch(launchedAsLoginItem: Self.launchedAsLoginItem()) {
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

    /// The real app lives on in the menu bar; the preview has no menu bar
    /// item, so closing its window quits it.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { isPreview }
}
