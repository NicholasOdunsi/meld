import Foundation
import Testing
@testable import OrionAppCore

struct DoneStarRowTests {
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

    /// hello, [request, answer = the Star], chat; optionally one follow-up and its answer.
    private func snapshot(status: String = "done", followUp: Bool = false,
                          activity: [[String: Any]] = [], requestLoaded: Bool = true) -> StreamSnapshot {
        var messages = [message("hello", minute: 0)]
        if requestLoaded { messages.append(message("request", minute: 1)) }
        messages.append(message("answer", orion: true, minute: 2, replyTo: "request", task: "star-1"))
        messages.append(message("chat", minute: 3))
        if followUp {
            messages.append(message("followup-1", minute: 4))
            messages.append(message("followup-answer", orion: true, minute: 5, replyTo: "followup-1", task: "task-f1"))
        }
        let fields: [String: Any] = [
            "roomId": "r1", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "messages": messages,
            "stars": [["id": "star-1", "sourceMessageId": "request", "title": "Review flow",
                       "status": status, "createdAt": "2026-11-14T10:01:00.000Z",
                       "followupMessageIds": followUp ? ["followup-1"] : []]],
            "activity": activity,
        ]
        return StreamSnapshot.decode(fields)!
    }

    @Test func aDoneStarBecomesOneRowInPlaceOfItsRequestAndAnswer() {
        let ids = snapshot().mainChatTimeline.map(\.id)
        #expect(ids == ["message:hello", "star:star-1", "message:chat"])
    }

    @Test func starsStillInProgressKeepTheirMessages() {
        for status in ["working", "needs_you", "stuck"] {
            let ids = snapshot(status: status).mainChatTimeline.map(\.id)
            #expect(ids == ["message:hello", "message:request", "message:answer", "message:chat"], "\(status)")
        }
    }

    @Test func theRowCarriesTheSameReplyCountAsTheThread() {
        let plain = snapshot()
        guard case .doneStar(_, let thread) = plain.mainChatTimeline[1] else { Issue.record("no row"); return }
        #expect(thread.replyCountLabel == "1 reply")

        let continued = snapshot(followUp: true)
        guard case .doneStar(_, let longer) = continued.mainChatTimeline[1] else { Issue.record("no row"); return }
        #expect(longer.replyCountLabel == "3 replies")
        // The follow-up and its answer stay out of the main chat, as before.
        #expect(continued.mainChatTimeline.map(\.id) == ["message:hello", "star:star-1", "message:chat"])
    }

    @Test func aDoneStarBeingContinuedIsShownExpanded() {
        let busy = snapshot(activity: [["taskId": "task-f1", "starId": "star-1", "phase": "replying"]])
        #expect(busy.collapsedStars.isEmpty)
        #expect(busy.mainChatTimeline.map(\.id) == ["message:hello", "message:request", "message:answer", "message:chat"])
    }

    @Test func theRowStillAppearsWhenTheRequestIsInAnEarlierPartOfTheChat() {
        let ids = snapshot(requestLoaded: false).mainChatTimeline.map(\.id)
        #expect(ids == ["message:hello", "star:star-1", "message:chat"])
    }

    @Test func scrollIDsMatchTheRowsTheChatDraws() {
        #expect(snapshot().mainChatTimeline.map(\.scrollID) == ["hello", "star:star-1", "chat"])
    }
}
