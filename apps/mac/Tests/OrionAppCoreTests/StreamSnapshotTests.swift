import Foundation
import Testing
@testable import OrionAppCore

struct StreamSnapshotTests {
    @Test func decodesScreensAndActivity() throws {
        let fields: [String: Any] = [
            "roomId": "r1", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "messages": [["id": "m1", "authorName": "Ada", "authorKind": "human", "text": "design it",
                          "createdAt": "2026-11-15T10:00:00.000Z"]],
            "screens": [
                ["id": "s1", "name": "Balance", "state": "built", "versionId": "v1", "formFactor": "mobile",
                 "createdAt": "2026-11-15T10:05:00.000Z", "updating": false],
                ["id": "s2", "name": "Card", "state": "building", "versionId": NSNull(), "formFactor": "desktop",
                 "createdAt": "2026-11-15T10:06:00.000Z", "updating": false],
            ],
            "activity": [
                ["taskId": "t1", "starId": NSNull(), "phase": "designing", "screenName": "Card"],
                ["taskId": "t2", "starId": "star1", "phase": "offline", "screenName": NSNull()],
                ["taskId": "m3", "starId": NSNull(), "phase": "failed", "screenName": NSNull(), "retryable": true],
            ],
        ]
        let snapshot = try #require(StreamSnapshot.decode(fields))
        #expect(snapshot.screens.map(\.id) == ["s1", "s2"])
        #expect(snapshot.screens[0].cacheKey == "s1-v1")
        #expect(snapshot.screens[1].cacheKey == nil)
        #expect(snapshot.screens[0].pixelSize == CGSize(width: 390, height: 844))
        #expect(snapshot.screens[1].pixelSize == CGSize(width: 1280, height: 800))
        #expect(snapshot.activity(forStar: nil)?.line() == "Designing Card…")
        #expect(snapshot.activity(forStar: "star1")?.line() == "Your Mac is offline. Orion will answer when it's back.")
        #expect(snapshot.activity.last?.retryable == true)
        #expect(snapshot.mainChatTimeline.map(\.id) == ["message:m1", "screen:s1", "screen:s2"])
    }

    @Test func activityLinesReadPlainly() {
        func line(_ phase: StreamActivity.Phase, name: String? = nil) -> String {
            StreamActivity(taskID: "t", starID: nil, phase: phase, screenName: name).line()
        }
        #expect(line(.reading) == "Orion is reading…")
        #expect(line(.replying) == "Orion is replying…")
        #expect(line(.designing) == "Designing the screen…")
        #expect(line(.needs_signin) == "Sign in to your AI tool on your Mac so Orion can answer.")
        #expect(line(.limit_reached) == "Your AI tool hit its usage limit.")
        #expect(line(.failed) == "Orion couldn't answer.")
    }
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

    @Test func decodesStarForReplyTask() {
        let fields: [String: Any] = [
            "roomId": "r1", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "messages": [["id": "reply", "authorKind": "orion", "authorName": "Orion", "text": "Done",
                          "createdAt": "2026-11-14T10:01:00.000Z", "taskId": "task-1"]],
            "stars": [["id": "task-1", "sourceMessageId": "request", "title": "Review flow",
                       "status": "done", "createdAt": "2026-11-14T10:00:00.000Z",
                       "followupMessageIds": ["followup-1"]]],
        ]
        let snapshot = StreamSnapshot.decode(fields)
        #expect(snapshot?.stars.first?.title == "Review flow")
        #expect(snapshot?.stars.first?.status == .done)
        #expect(snapshot?.messages.first?.taskID == "task-1")
        #expect(snapshot?.stars.first?.followupMessageIDs == ["followup-1"])
    }

    @Test func keepsValidArtifactsWhenOneRowIsMalformed() {
        let fields: [String: Any] = [
            "roomId": "r1", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "artifacts": [
                ["id": "file:f1", "kind": "file", "title": "notes.pdf", "href": "https://example.test/f1",
                 "starId": "task-1", "createdAt": "2026-11-15T10:00:00.000Z"],
                ["id": "bad", "kind": "unknown", "title": "Ignore me"],
            ],
        ]
        let snapshot = StreamSnapshot.decode(fields)
        #expect(snapshot?.artifacts.map(\.id) == ["file:f1"])
        #expect(snapshot?.artifacts.first?.starID == "task-1")
        #expect(snapshot?.artifacts.first?.createdAt != nil)
    }
}
