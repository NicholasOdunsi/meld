import Foundation
import Testing
@testable import OrionAppCore

struct BridgeMessageTests {
    @Test func decodesReady() {
        let id = UUID()
        #expect(BridgeMessage.decode(["v": 1, "type": "ready", "workspaceId": id.uuidString.lowercased()]) == .ready(workspaceID: id))
        #expect(BridgeMessage.decode(["v": 1, "type": "ready", "workspaceId": NSNull()]) == .ready(workspaceID: nil))
    }

    @Test func decodesNotifyAndTrimsLongText() {
        let long = String(repeating: "a", count: 500)
        let message = BridgeMessage.decode(["v": 1, "type": "notify", "title": long, "body": long, "path": "/w"])
        #expect(message == .notify(title: String(long.prefix(120)), body: String(long.prefix(300)), path: "/w"))
    }

    @Test func decodesShelfMessages() {
        #expect(BridgeMessage.decode(["v": 1, "type": "shelfConnectCode", "code": "ABCD-1234"]) == .shelfConnectCode("ABCD-1234"))
        #expect(BridgeMessage.decode(["v": 1, "type": "shelfConnectFailed", "message": "nope"]) == .shelfConnectFailed("nope"))
    }

    @Test func ignoresUnknownOrMalformed() {
        #expect(BridgeMessage.decode(["v": 2, "type": "ready"]) == nil)
        #expect(BridgeMessage.decode(["v": 1, "type": "explode"]) == nil)
        #expect(BridgeMessage.decode(["v": 1, "type": "notify", "title": "x"]) == nil)
        #expect(BridgeMessage.decode(["v": 1, "type": "shelfConnectCode", "code": ""]) == nil)
    }

    @Test func ignoresNonDictionaries() {
        #expect(BridgeMessage.decode("ready") == nil)
        #expect(BridgeMessage.decode(42) == nil)
    }
}
