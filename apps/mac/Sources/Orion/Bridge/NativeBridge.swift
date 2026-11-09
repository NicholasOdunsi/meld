import Foundation
import OrionAppCore
import WebKit

@MainActor
protocol NotificationPresenting: AnyObject {
    func present(title: String, body: String, url: URL) async
}

@MainActor
protocol ShelfAutoConnecting: AnyObject {
    var needsConnection: Bool { get }
    func connectAutomatically(code: String) async
}

/// Receives messages from the Orion website (see apps/web/src/features/native/bridge.ts).
/// WKUserContentController retains this strongly, so it must never reference the web view.
@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandler {
    private let appOrigin: URL
    private let isLookingAtOrion: () -> Bool
    private let presenter: any NotificationPresenting
    private let shelf: any ShelfAutoConnecting
    private let askForShelfCode: () -> Void
    private let onFrame: (FrameSnapshot) -> Void
    private let now: () -> Date
    private var codeRequestedAt: Date?
    private var connectInFlight = false
    private static let codeRequestLifetime: TimeInterval = 30

    init(
        appOrigin: URL,
        isLookingAtOrion: @escaping () -> Bool,
        presenter: any NotificationPresenting,
        shelf: any ShelfAutoConnecting,
        askForShelfCode: @escaping () -> Void,
        onFrame: @escaping (FrameSnapshot) -> Void = { _ in },
        now: @escaping () -> Date = Date.init
    ) {
        self.onFrame = onFrame
        self.now = now
        self.appOrigin = appOrigin
        self.isLookingAtOrion = isLookingAtOrion
        self.presenter = presenter
        self.shelf = shelf
        self.askForShelfCode = askForShelfCode
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame,
              isSameOrigin(scheme: origin.protocol, host: origin.host, port: origin.port, as: appOrigin),
              let decoded = BridgeMessage.decode(message.body) else { return }
        Task { await handle(decoded) }
    }

    func handle(_ message: BridgeMessage) async {
        switch message {
        case .ready(let workspaceID):
            guard workspaceID != nil, shelf.needsConnection, !connectInFlight else { return }
            // A request with no reply (page reloaded, handler not ready) expires so the next ready can retry.
            if let requestedAt = codeRequestedAt, now().timeIntervalSince(requestedAt) < Self.codeRequestLifetime { return }
            codeRequestedAt = now()
            askForShelfCode()
        case .shelfConnectCode(let code):
            // Only redeem a code we asked for; ignore unsolicited ones.
            guard shelf.needsConnection, codeRequestedAt != nil else { return }
            connectInFlight = true
            await shelf.connectAutomatically(code: code)
            connectInFlight = false
            codeRequestedAt = nil
        case .shelfConnectFailed:
            codeRequestedAt = nil
        case .frame(let snapshot):
            onFrame(snapshot)
        case .notify(let title, let body, let path):
            guard !isLookingAtOrion(), let url = RestorableURL.resolve(path: path, appOrigin: appOrigin) else { return }
            await presenter.present(title: title, body: body, url: url)
        }
    }
}
