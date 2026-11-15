import Foundation
import Testing
@testable import OrionAppCore

struct StarThreadTests {
    private func message(_ id: String, orion: Bool = false, minute: Int, replyTo: String? = nil,
                         task: String? = nil) -> [String: Any] {
        var row: [String: Any] = [
            "id": id, "authorKind": orion ? "orion" : "human", "authorName": orion ? "Orion" : "Ada",
            "text": id, "createdAt": String(format: "2026-11-14T10:%02d:00.000Z", minute),
        ]
        if let replyTo { row["replyToId"] = replyTo }
        if let task { row["taskId"] = task }
        return row
    }

    private func snapshot(followups: [String]) -> StreamSnapshot {
        let fields: [String: Any] = [
            "roomId": "r1", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "messages": [
                message("hello", minute: 0),
                message("request", minute: 1),
                message("answer", orion: true, minute: 2, replyTo: "request", task: "star-1"),
                message("chat", minute: 3),
                message("followup-1", minute: 4),
                message("chat-answer", orion: true, minute: 5, replyTo: "chat", task: "task-chat"),
                message("followup-answer", orion: true, minute: 6, replyTo: "followup-1", task: "task-f1"),
                message("followup-2", minute: 7),
            ],
            "stars": [["id": "star-1", "sourceMessageId": "request", "title": "Review flow",
                       "status": "working", "createdAt": "2026-11-14T10:01:00.000Z",
                       "followupMessageIds": followups]],
        ]
        return StreamSnapshot.decode(fields)!
    }

    @Test func mainChatHidesFollowupsAndTheirAnswers() {
        let main = snapshot(followups: ["followup-1", "followup-2"]).mainChatMessages.map(\.id)
        #expect(!main.contains("followup-1"))
        #expect(!main.contains("followup-2"))
        #expect(!main.contains("followup-answer"))
    }

    @Test func mainChatKeepsOrdinaryMessagesAndTheStarStart() {
        let main = snapshot(followups: ["followup-1", "followup-2"]).mainChatMessages.map(\.id)
        #expect(main == ["hello", "request", "answer", "chat", "chat-answer"])
    }

    @Test func threadListsRequestThenRepliesInOrder() {
        let value = snapshot(followups: ["followup-1", "followup-2"])
        let thread = value.thread(for: value.stars[0])
        #expect(thread.request?.id == "request")
        #expect(thread.replies.map(\.id) == ["answer", "followup-1", "followup-answer", "followup-2"])
    }

    @Test func starWithoutFollowups() {
        let value = snapshot(followups: [])
        let thread = value.thread(for: value.stars[0])
        #expect(thread.request?.id == "request")
        #expect(thread.replies.map(\.id) == ["answer"])
        #expect(value.mainChatMessages == value.messages)
    }

    @Test func threadWithoutLoadedRequest() {
        let value = snapshot(followups: [])
        let missing = StreamStar(id: "star-2", sourceMessageID: "gone", title: "Old", status: .done,
                                 constellation: nil, createdAt: .now, followupMessageIDs: [])
        let thread = value.thread(for: missing)
        #expect(thread.request == nil)
        #expect(thread.replies.isEmpty)
    }
}
