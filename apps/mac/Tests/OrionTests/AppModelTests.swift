import AppKit
import Foundation
import ShelfCore
import ShelfTestSupport
import Testing
@testable import Orion

@MainActor
struct AppModelTests {
    private func png() -> CapturedImage {
        CapturedImage(data: TestImages.encoded(width: 8, height: 8, as: .png), sourceURL: URL(string: "https://pinterest.com/pin/1"))
    }

    @Test func captureQueuesUploadsAndRemembersTheItem() async throws {
        let itemID = UUID()
        let deps = TestDependencies(client: FakeOrionClient(uploadResults: [.success(ShelfUploadResponse(itemId: itemID, duplicate: false, roomLinked: false))]))
        let model = deps.makeModel()

        await model.capture([png()], note: "nav", roomID: nil)
        await model.retryNow()

        #expect(model.waitingCount == 0)
        #expect(model.recent.first?.itemID == itemID)
        let sent = await deps.client.uploads
        #expect(sent.first?.note == "nav")
        #expect(sent.first?.sourceURL == URL(string: "https://pinterest.com/pin/1"))
    }

    @Test func nonImagesAreRefusedWithAMessage() async {
        let model = TestDependencies().makeModel()
        await model.capture([CapturedImage(data: Data("text".utf8), sourceURL: nil)], note: nil, roomID: nil)
        #expect(model.icon == .rejected)
        #expect(model.lastMessage == "Only images for now.")
    }

    @Test func anEmptyClipboardSaysSo() async {
        let model = TestDependencies().makeModel()
        await model.captureClipboard()
        #expect(model.lastMessage == "No image on the clipboard.")
    }

    @Test func theClipboardIsReadFromTheInjectedPasteboard() async {
        let deps = TestDependencies(client: FakeOrionClient(uploadResults: [.success(ShelfUploadResponse(itemId: UUID(), duplicate: false, roomLinked: false))]))
        // PasteboardReader reads NSPasteboardItem rows; writeObjects matches how
        // browsers and the ShelfCore pasteboard tests place image bytes.
        let item = NSPasteboardItem()
        item.setData(TestImages.encoded(width: 8, height: 8, as: .png), forType: .png)
        deps.pasteboard.writeObjects([item])
        let model = deps.makeModel()

        await model.captureClipboard()
        await model.retryNow()

        let uploads = await deps.client.uploads
        #expect(uploads.count == 1)
    }

    @Test func aRevokedTokenDisconnectsButKeepsTheQueue() async {
        let unauthorized = ShelfAPIError(code: .unauthorized, message: "Reconnect the shelf in Orion Settings → Shelf.")
        let deps = TestDependencies(client: FakeOrionClient(uploadResults: [.failure(unauthorized)]))
        let model = deps.makeModel()

        await model.capture([png()], note: nil, roomID: nil)
        await model.retryNow()

        #expect(model.connection == .disconnected)
        #expect(model.icon == .disconnected)
        #expect(model.waitingCount == 1)
    }

    @Test func connectStoresTheTokenAndTurnsOnLaunchAtLogin() async throws {
        let workspaceID = UUID()
        let deps = TestDependencies(
            client: FakeOrionClient(connectResult: .success(ShelfConnectResponse(token: "orion_cap_new", workspaceId: workspaceID, workspaceName: "Studio"))),
            token: nil,
            connectedTo: nil
        )
        let model = deps.makeModel()

        try await model.connect(baseURLString: "http://127.0.0.1:3000", code: "ABCD1234")

        #expect(model.connection == .connected(workspaceID: workspaceID, workspaceName: "Studio"))
        #expect(try deps.tokenStore.token() == "orion_cap_new")
        #expect(deps.launchAtLogin.isEnabled)
    }

    @Test func connectRejectsANonWebAddress() async {
        let model = TestDependencies(token: nil, connectedTo: nil).makeModel()
        await #expect(throws: ShelfAPIError.self) {
            try await model.connect(baseURLString: "ftp://nope", code: "ABCD1234")
        }
    }

    @Test func openLibraryLinksToTheItem() throws {
        let recorder = URLRecorder()
        let model = TestDependencies().makeModel { recorder.urls.append($0) }
        let itemID = UUID()

        model.openLibrary(itemID: itemID)

        let url = try #require(recorder.urls.first)
        #expect(url.path().hasSuffix("/inspiration"))
        #expect(url.query()?.contains("item=\(itemID.uuidString.lowercased())") == true)
    }

    @Test func disconnectForgetsTheToken() throws {
        let deps = TestDependencies()
        let model = deps.makeModel()
        model.disconnect()
        #expect(model.connection == .disconnected)
        #expect(try deps.tokenStore.token() == nil)
    }
}
