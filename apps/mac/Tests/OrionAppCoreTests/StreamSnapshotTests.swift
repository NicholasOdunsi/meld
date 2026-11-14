import Foundation
import Testing
@testable import OrionAppCore

struct StreamSnapshotTests {
    @Test func decodesAndQuotesReply() throws {
        let fields: [String: Any] = [
            "v": 1, "type": "stream", "roomId": "r1", "projectId": "p1",
            "currentUserName": "Ada", "orionBusy": false, "send": ["canSend": true],
            "defaultProvider": "claude", "choices": [["provider": "claude", "models": ["sonnet"], "defaultModel": "sonnet"]],
            "messages": [
                ["id": "a", "authorKind": "human", "authorName": "Ada", "text": "Please compare these", "createdAt": "2026-11-14T10:00:00.000Z", "delivery": "persisted"],
                ["id": "b", "authorKind": "orion", "authorName": "Orion", "text": "On it", "createdAt": "2026-11-14T10:01:00.000Z", "replyToId": "a", "delivery": "persisted"],
            ],
        ]
        guard case .stream(let value)? = BridgeMessage.decode(fields) else {
            Issue.record("stream was not decoded")
            return
        }
        #expect(value.messages.map(\.id) == ["a", "b"])
        #expect(value.quote(for: value.messages[1]) == "↱ Ada  Please compare these")
        #expect(value.choices.first?.defaultModel == "sonnet")
        #expect(value.canSend)
    }

    @Test func rejectsIncompleteStream() {
        #expect(StreamSnapshot.decode(["roomId": "r1", "projectId": "p1"]) == nil)
    }

    @Test func keepsAttachmentOnlyMessage() {
        let fields: [String: Any] = [
            "roomId": "r1", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "messages": [["id": "a", "authorKind": "human", "authorName": "Ada", "text": "",
                          "attachments": [["id": "file-1", "name": "brief.pdf"]],
                          "createdAt": "2026-11-14T10:00:00.000Z"]],
        ]
        let snapshot = StreamSnapshot.decode(fields)
        #expect(snapshot?.messages.first?.attachments.first?.name == "brief.pdf")
    }
}
