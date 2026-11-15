import Foundation
import Testing
@testable import OrionAppCore

struct ScreenGroupTests {
    private func screen(_ id: String, second: Int, state: String = "built") -> [String: Any] {
        ["id": id, "name": id, "state": state, "versionId": state == "built" ? "v-\(id)" : NSNull(),
         "formFactor": "mobile", "createdAt": String(format: "2026-11-15T10:%02d:%02d.000Z", second / 60, second % 60),
         "updating": false]
    }

    private func message(_ id: String, orion: Bool, second: Int, task: String? = nil) -> [String: Any] {
        var row: [String: Any] = ["id": id, "authorKind": orion ? "orion" : "human", "authorName": orion ? "Orion" : "Ada",
                                  "text": id, "createdAt": String(format: "2026-11-15T10:%02d:%02d.000Z", second / 60, second % 60)]
        if let task { row["taskId"] = task }
        return row
    }

    private func snapshot(screens: [[String: Any]], messages: [[String: Any]] = [], stars: [[String: Any]] = []) -> StreamSnapshot {
        StreamSnapshot.decode([
            "roomId": "r1", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "messages": messages, "screens": screens, "stars": stars,
        ])!
    }

    @Test func threeScreensCloseTogetherBecomeOneGroup() {
        let value = snapshot(screens: [screen("s1", second: 0), screen("s2", second: 20), screen("s3", second: 40, state: "building")])
        let items = value.mainChatTimeline
        #expect(items.map(\.id) == ["screens:s1"])
        guard case .screenGroup(let group) = items[0] else { Issue.record("no group"); return }
        #expect(group.map(\.id) == ["s1", "s2", "s3"])
        #expect(items.map(\.scrollID) == ["screens:s1"])
    }

    @Test func twoScreensKeepTheirOwnCards() {
        let value = snapshot(screens: [screen("s1", second: 0), screen("s2", second: 20)])
        #expect(value.mainChatTimeline.map(\.id) == ["screen:s1", "screen:s2"])
    }

    @Test func aLongGapStartsANewCluster() {
        // s3 is 5 minutes after s2, so only s1 and s2 cluster (2 screens: no group).
        let value = snapshot(screens: [screen("s1", second: 0), screen("s2", second: 60), screen("s3", second: 360)])
        #expect(value.mainChatTimeline.map(\.id) == ["screen:s1", "screen:s2", "screen:s3"])
    }

    @Test func aHumanMessageBetweenScreensStartsANewCluster() {
        let value = snapshot(
            screens: [screen("s1", second: 0), screen("s2", second: 20), screen("s3", second: 60), screen("s4", second: 80)],
            messages: [message("ask-again", orion: false, second: 40)])
        #expect(value.mainChatTimeline.map(\.id) == ["screen:s1", "screen:s2", "message:ask-again", "screen:s3", "screen:s4"])
    }

    @Test func anOrionMessageBetweenScreensDoesNotSplitTheGroup() {
        let value = snapshot(
            screens: [screen("s1", second: 0), screen("s2", second: 20), screen("s3", second: 40)],
            messages: [message("note", orion: true, second: 30)])
        #expect(value.mainChatTimeline.map(\.id) == ["screens:s1", "message:note"])
    }

    @Test func finishedStarsKeepTheirMessagesInTheTimeline() {
        let value = snapshot(
            screens: [],
            messages: [message("request", orion: false, second: 0), message("answer", orion: true, second: 5, task: "star-1")],
            stars: [["id": "star-1", "sourceMessageId": "request", "title": "Review flow", "status": "done",
                     "createdAt": "2026-11-15T10:00:00.000Z", "followupMessageIds": []]])
        #expect(value.mainChatTimeline.map(\.id) == ["message:request", "message:answer"])
    }
}
