import AppKit
import Foundation
import ShelfCore
import ShelfTestSupport
@testable import OrionShelf

/// Builds an AppModel wired to temp folders, a private pasteboard, and fakes.
@MainActor
struct TestDependencies {
    let client: FakeOrionClient
    let tokenStore: InMemoryTokenStore
    let launchAtLogin = FakeLaunchAtLogin()
    let pasteboard = NSPasteboard(name: NSPasteboard.Name("orion-shelf-test-\(UUID().uuidString)"))
    let defaults: UserDefaults
    let outboxDirectory = URL.temporaryDirectory.appending(path: "shelf-app-\(UUID().uuidString)", directoryHint: .isDirectory)

    init(client: FakeOrionClient = FakeOrionClient(), token: String? = "orion_cap_test", connectedTo workspaceName: String? = "Mine") {
        self.client = client
        self.tokenStore = InMemoryTokenStore(token: token)
        let suite = "orion-shelf-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite) ?? .standard
        if let workspaceName {
            defaults.set(UUID().uuidString, forKey: "workspaceID")
            defaults.set(workspaceName, forKey: "workspaceName")
        }
        pasteboard.clearContents()
    }

    func makeModel(onOpen: @escaping @MainActor (URL) -> Void = { _ in }) -> AppModel {
        AppModel(dependencies: AppDependencies(
            outbox: Outbox(directory: outboxDirectory),
            outboxDirectory: outboxDirectory,
            normalizer: ImageNormalizer(),
            pasteboardReader: PasteboardReader(),
            pasteboard: pasteboard,
            defaults: defaults,
            makeClient: { [client] _ in client },
            makeTokenStore: { [tokenStore] _ in tokenStore },
            launchAtLogin: launchAtLogin,
            openURL: onOpen,
            deviceName: "Test Mac"
        ))
    }
}
