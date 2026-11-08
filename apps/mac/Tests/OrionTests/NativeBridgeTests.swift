import Foundation
import OrionAppCore
import Testing
@testable import Orion

@MainActor
final class RecordingPresenter: NotificationPresenting {
    var shown: [(String, String, URL)] = []
    func present(title: String, body: String, url: URL) async { shown.append((title, body, url)) }
}

@MainActor
final class FakeShelf: ShelfAutoConnecting {
    var needsConnection = true
    var codes: [String] = []
    func connectAutomatically(code: String) async { codes.append(code); needsConnection = false }
}

@MainActor
struct NativeBridgeTests {
    private let origin = URL(string: "https://orion.test")!

    private func make(looking: Bool = false, shelf: FakeShelf = FakeShelf(), asks: @escaping () -> Void = {}, now: @escaping () -> Date = Date.init) -> (NativeBridge, RecordingPresenter) {
        let presenter = RecordingPresenter()
        return (NativeBridge(appOrigin: origin, isLookingAtOrion: { looking }, presenter: presenter, shelf: shelf, askForShelfCode: asks, now: now), presenter)
    }

    @Test func notifiesWhenYouAreElsewhere() async {
        let (bridge, presenter) = make(looking: false)
        await bridge.handle(.notify(title: "Screens ready", body: "In Home", path: "/w/rooms/r"))
        #expect(presenter.shown.count == 1)
        #expect(presenter.shown.first?.2.absoluteString == "https://orion.test/w/rooms/r")
    }

    @Test func staysQuietWhileYouAreLooking() async {
        let (bridge, presenter) = make(looking: true)
        await bridge.handle(.notify(title: "Screens ready", body: "In Home", path: "/w/rooms/r"))
        #expect(presenter.shown.isEmpty)
    }

    @Test func dropsNotificationsWithUnsafePaths() async {
        let (bridge, presenter) = make()
        await bridge.handle(.notify(title: "x", body: "y", path: "https://evil.example"))
        #expect(presenter.shown.isEmpty)
    }

    @Test func asksForAShelfCodeOnceWhenNotConnected() async {
        var asked = 0
        let (bridge, _) = make(asks: { asked += 1 })
        await bridge.handle(.ready(workspaceID: UUID()))
        await bridge.handle(.ready(workspaceID: UUID()))
        #expect(asked == 1)
    }

    @Test func doesNotAskWhenSignedOutOrAlreadyConnected() async {
        var asked = 0
        let shelf = FakeShelf()
        let (bridge, _) = make(shelf: shelf, asks: { asked += 1 })
        await bridge.handle(.ready(workspaceID: nil))
        shelf.needsConnection = false
        await bridge.handle(.ready(workspaceID: UUID()))
        #expect(asked == 0)
    }

    @Test func redeemsTheCodeAndAllowsARetryAfterFailure() async {
        var asked = 0
        let shelf = FakeShelf()
        let (bridge, _) = make(shelf: shelf, asks: { asked += 1 })
        await bridge.handle(.ready(workspaceID: UUID()))
        await bridge.handle(.shelfConnectFailed("nope"))
        await bridge.handle(.ready(workspaceID: UUID()))
        #expect(asked == 2)
        await bridge.handle(.shelfConnectCode("ABCD-1234"))
        #expect(shelf.codes == ["ABCD-1234"])
    }

    @Test func anUnsolicitedCodeIsIgnored() async {
        let shelf = FakeShelf()
        let (bridge, _) = make(shelf: shelf)
        await bridge.handle(.shelfConnectCode("ABCD-1234"))
        #expect(shelf.codes.isEmpty)
    }

    @Test func anUnansweredRequestExpiresAfterThirtySeconds() async {
        var asked = 0
        var clock = Date(timeIntervalSince1970: 1_000)
        let (bridge, _) = make(asks: { asked += 1 }, now: { clock })
        await bridge.handle(.ready(workspaceID: UUID()))
        clock = clock.addingTimeInterval(29)
        await bridge.handle(.ready(workspaceID: UUID()))
        #expect(asked == 1)
        clock = clock.addingTimeInterval(2)
        await bridge.handle(.ready(workspaceID: UUID()))
        #expect(asked == 2)
    }

    @Test func asksAgainAfterASuccessfulConnectAndALaterDisconnect() async {
        var asked = 0
        let shelf = FakeShelf()
        let (bridge, _) = make(shelf: shelf, asks: { asked += 1 })
        await bridge.handle(.ready(workspaceID: UUID()))
        await bridge.handle(.shelfConnectCode("ABCD-1234"))
        shelf.needsConnection = true
        await bridge.handle(.ready(workspaceID: UUID()))
        #expect(asked == 2)
    }
}
