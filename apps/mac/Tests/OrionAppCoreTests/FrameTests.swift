import Foundation
import Testing
@testable import OrionAppCore

struct FrameTests {
    private let ws = "11111111-1111-1111-1111-111111111111"
    private let tabs = [
        FrameTab(id: "r2", projectID: "p1", name: "Design pass", createdAt: "2026-11-02T00:00:00Z"),
        FrameTab(id: "r1", projectID: "p1", name: "Main", createdAt: "2026-11-01T00:00:00Z"),
        FrameTab(id: "r9", projectID: "p2", name: "Main", createdAt: "2026-11-01T00:00:00Z"),
    ]

    @Test func decodesFrameMessage() {
        let message = BridgeMessage.decode([
            "v": 1, "type": "frame", "workspaceId": ws, "path": "/\(ws)/rooms/r1",
            "projects": [["id": "p1", "name": "Orion", "icon": "rocket", "color": "teal"], ["name": "no id"]],
            "tabs": [["id": "r1", "projectId": "p1", "name": "Main", "createdAt": "2026-11-01"]],
            "hasTasteUpdates": true,
        ])
        guard case .frame(let snapshot) = message else {
            Issue.record("expected a frame message")
            return
        }
        #expect(snapshot.projects == [FrameProject(id: "p1", name: "Orion", icon: "rocket", color: "teal")])
        #expect(snapshot.tabs.count == 1)
        #expect(snapshot.hasTasteUpdates)
        #expect(snapshot.currentRoomID == "r1")
    }

    @Test func rejectsFrameWithoutSafePath() {
        #expect(BridgeMessage.decode(["v": 1, "type": "frame", "workspaceId": ws, "path": "//evil"]) == nil)
        #expect(BridgeMessage.decode(["v": 1, "type": "frame", "workspaceId": ws]) == nil)
    }

    @Test func ordersProjectTabsOldestFirst() {
        let snapshot = FrameSnapshot(workspaceID: ws, path: "/\(ws)", projects: [], tabs: tabs, hasTasteUpdates: false)
        #expect(snapshot.tabs(in: "p1").map(\.id) == ["r1", "r2"])
    }

    @Test(arguments: [
        ("", FrameDestination?.some(.home)),
        ("/inspiration", .inspiration),
        ("/inspiration?item=x", .inspiration),
        ("/inspiration?tab=taste", .taste),
        ("/design-system", .designSystem),
        ("/settings/shelf", .settings),
        ("/projects/p2", .project("p2")),
        ("/rooms/r2?tab=prd", .project("p1")),
        ("/rooms/unknown", nil),
        ("/onboarding", nil),
    ])
    func readsDestinationFromPath(suffix: String, expected: FrameDestination?) {
        #expect(FrameDestination(path: "/\(ws)\(suffix)", workspaceID: ws, tabs: tabs) == expected)
    }

    @Test func ignoresOtherWorkspaces() {
        #expect(FrameDestination(path: "/other/inspiration", workspaceID: ws, tabs: tabs) == nil)
    }

    @Test func destinationPathsRoundTrip() {
        for destination in [FrameDestination.home, .inspiration, .taste, .designSystem, .settings, .project("p2")] {
            #expect(FrameDestination(path: destination.path(workspaceID: ws), workspaceID: ws, tabs: tabs) == destination)
        }
    }

    @Test func overflowKeepsSixAndTheSelectedTab() {
        let many = (0..<8).map { FrameTab(id: "t\($0)", projectID: "p", name: "T\($0)", createdAt: "\($0)") }
        let plain = TabOverflow.split(many, selectedID: "t0")
        #expect(plain.visible.map(\.id) == ["t0", "t1", "t2", "t3", "t4", "t5"])
        #expect(plain.overflow.map(\.id) == ["t6", "t7"])
        let selectedLate = TabOverflow.split(many, selectedID: "t7")
        #expect(selectedLate.visible.last?.id == "t7")
        #expect(selectedLate.overflow.map(\.id) == ["t5", "t6"])
        #expect(TabOverflow.split(Array(many.prefix(3)), selectedID: nil).overflow.isEmpty)
    }

    @Test func decodesActivity() throws {
        let snapshot = try #require(FrameSnapshot.decode([
            "workspaceId": "ws", "path": "/ws",
            "activity": [
                "projects": [["id": "p1", "state": "working", "label": "Orion: working"]],
                "tabs": [["id": "t1", "state": "needs_you", "label": "Mark needs you · Write the PRD?"],
                         ["id": "bad", "state": "sleeping", "label": "x"]],
            ],
        ]))
        #expect(snapshot.projectActivity["p1"]?.state == .working)
        #expect(snapshot.tabActivity["t1"]?.label == "Mark needs you · Write the PRD?")
        #expect(snapshot.tabActivity["bad"] == nil)
    }

    @Test func missingActivityIsEmpty() throws {
        let snapshot = try #require(FrameSnapshot.decode(["workspaceId": "ws", "path": "/ws"]))
        #expect(snapshot.projectActivity.isEmpty && snapshot.tabActivity.isEmpty)
    }
}

struct FrameCallResultTests {
    @Test func parsesResults() {
        #expect(FrameCallResult.parse(["status": "ok", "path": "/w/rooms/r"]) == .ok(path: "/w/rooms/r"))
        #expect(FrameCallResult.parse(["status": "ok"]) == .ok(path: nil))
        #expect(FrameCallResult.parse(["status": "ok", "path": "https://evil"]) == .ok(path: nil))
        #expect(FrameCallResult.parse(["status": "error", "message": "Nope"]) == .failed("Nope"))
        #expect(FrameCallResult.parse(nil) == .unavailable)
        #expect(FrameCallResult.parse(NSNull()) == .unavailable)
    }
}

struct FramePagesTests {
    @Test func knowsPagesOutsideTheFrame() {
        #expect(FramePages.isOutsideFrame(URL(string: "https://o.app/sign-in?next=/x")))
        #expect(FramePages.isOutsideFrame(URL(string: "https://o.app/onboarding/ws/setup")))
        #expect(!FramePages.isOutsideFrame(URL(string: "https://o.app/ws/inspiration")))
        #expect(!FramePages.isOutsideFrame(URL(string: "https://o.app/sign-ins")))
        #expect(!FramePages.isOutsideFrame(nil))
    }
}
