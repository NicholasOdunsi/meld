import Foundation
import Testing
@testable import OrionAppCore

struct StarRouteChoiceTests {
    private let id = "10000000-0000-4000-8000-000000000001"

    @Test func keepsBuildIntentFromTheBridge() {
        let id = "10000000-0000-4000-8000-000000000001"
        #expect(StarRouteChoice.parse(["status": "route", "decision": "new", "intent": "build"]) == .build(starID: nil))
        #expect(StarRouteChoice.parse(["status": "route", "decision": "continue", "starTaskId": id, "intent": "unsure"]) == .unsure(starID: id))
    }

    @Test func parsesContinueAndAsk() {
        #expect(StarRouteChoice.parse(["status": "route", "decision": "continue", "starTaskId": id, "title": "Profile"]) == .continue(id: id, title: "Profile"))
        #expect(StarRouteChoice.parse(["status": "route", "decision": "ask", "starTaskId": id, "title": "Profile"]) == .ask(id: id, title: "Profile"))
    }

    @Test func malformedResultStartsNew() {
        #expect(StarRouteChoice.parse(nil) == .new)
        #expect(StarRouteChoice.parse(["status": "route", "decision": "continue", "starTaskId": "wrong", "title": "Profile"]) == .new)
        #expect(StarRouteChoice.parse(["status": "route", "decision": "new"]) == .new)
    }
}
