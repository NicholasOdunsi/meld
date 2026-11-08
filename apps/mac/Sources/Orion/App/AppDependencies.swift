import AppKit
import OrionAppCore
import ShelfCore

/// Everything AppModel touches outside itself, injected so tests use fakes.
struct AppDependencies {
    let outbox: Outbox
    let outboxDirectory: URL
    let normalizer: ImageNormalizer
    let pasteboardReader: PasteboardReader
    let pasteboard: NSPasteboard
    let defaults: UserDefaults
    let makeClient: (URL) -> any OrionClient
    let makeTokenStore: (URL) -> any TokenStore
    let launchAtLogin: any LaunchAtLogin
    let openURL: @MainActor (URL) -> Void
    let deviceName: String
    let defaultBaseURL: URL

    @MainActor
    static var live: AppDependencies {
        AppDependencies(
            outbox: Outbox(),
            outboxDirectory: Outbox.defaultDirectory,
            normalizer: ImageNormalizer(),
            pasteboardReader: PasteboardReader(),
            pasteboard: .general,
            defaults: .standard,
            makeClient: { URLSessionOrionClient(baseURL: $0) },
            makeTokenStore: { KeychainTokenStore(account: $0.absoluteString) },
            launchAtLogin: SMAppServiceLaunchAtLogin(),
            openURL: { NSWorkspace.shared.open($0) },
            deviceName: String(localized: "Orion on \(Host.current().localizedName ?? String(localized: "Mac"))"),
            defaultBaseURL: AppConfig.baseURL(info: Bundle.main.infoDictionary, defaults: .standard)
        )
    }
}
