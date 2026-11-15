import Foundation
import OrionAppCore
import Testing
@testable import Orion

@MainActor
final class FakeFrameCommander: FrameCommanding {
    var calls: [(body: String, arguments: [String: any Sendable])] = []
    var loads: [String] = []
    var result: FrameCallResult = .ok(path: nil)

    func callFrame(_ functionBody: String, arguments: [String: any Sendable]) async -> FrameCallResult {
        calls.append((functionBody, arguments))
        return functionBody.contains("navigate") ? navigateResult : result
    }

    var navigateResult: FrameCallResult = .ok(path: nil)

    func load(path: String) { loads.append(path) }

    func navigatedPaths() -> [String] {
        calls.filter { $0.body.contains("navigate") }.compactMap { $0.arguments["path"] as? String }
    }
}

@MainActor
struct FrameModelTests {
    @Test func openingAScreenFromTheChatOpensCanvasFocusedOnIt() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        model.openScreenInCanvas("s1")
        #expect(model.projectPanel == .canvas)
        #expect(model.canvasScreenID == "s1")
        #expect(model.canvasStarID == nil)
        model.showProjectCanvas()
        #expect(model.canvasScreenID == nil)
        model.openScreenInCanvas("s2")
        model.togglePanel(.canvas)
        #expect(model.projectPanel == nil)
        #expect(model.canvasScreenID == nil)
    }
    private let ws = "ws"
    private let tabs = [
        FrameTab(id: "main", projectID: "p1", name: "Main", createdAt: "1"),
        FrameTab(id: "design", projectID: "p1", name: "Design pass", createdAt: "2"),
        FrameTab(id: "other", projectID: "p2", name: "Main", createdAt: "1"),
    ]
    private let projects = [
        FrameProject(id: "p1", name: "Orion", icon: "rocket", color: "teal"),
        FrameProject(id: "p2", name: "Hermord", icon: "folder", color: "blue"),
    ]

    private func snapshot(_ suffix: String) -> FrameSnapshot {
        FrameSnapshot(workspaceID: ws, path: "/\(ws)\(suffix)", projects: projects, tabs: tabs, hasTasteUpdates: false)
    }

    private func settle() async {
        for _ in 0..<5 { await Task.yield() }
    }

    @Test func showsTheOpenProjectAndItsTabs() {
        let model = FrameModel()
        #expect(!model.isAvailable)
        model.update(snapshot("/rooms/design"))
        #expect(model.isAvailable)
        #expect(model.currentProject?.name == "Orion")
        #expect(model.currentTabs.map(\.id) == ["main", "design"])
        #expect(model.tabSelection == "design")
        #expect(model.chatCount(for: projects[0]) == 2)
    }

    @Test func switchingBackToAProjectOpensMainChat() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(snapshot("/rooms/design"))
        model.update(snapshot("/rooms/other"))

        model.sidebarSelection = .project("p1")
        #expect(model.destination == .project("p1"))
        await settle()
        #expect(commander.navigatedPaths() == ["/ws/rooms/main"])
    }

    @Test func canvasGivesSpaceBackToTheChatWhenClosed() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        #expect(model.isSidebarOpen)
        model.togglePanel(.canvas)
        #expect(model.projectPanel == .canvas)
        #expect(!model.isSidebarOpen)
        model.togglePanel(.canvas)
        #expect(model.projectPanel == nil)
        #expect(model.isSidebarOpen)
    }

    @Test func canvasOpenedFromAStarKeepsThatConversationUntilReturnOrClose() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        model.updateStream(StreamSnapshot.decode([
            "roomId": "main", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "stars": [["id": "t1", "sourceMessageId": "m1", "title": "Review",
                       "status": "working", "createdAt": "2026-11-14T10:00:00.000Z"]],
        ])!)
        model.openStar("t1")
        model.togglePanel(.canvas)
        #expect(model.projectPanel == .canvas)
        #expect(model.canvasStarID == "t1")
        #expect(model.openStarID == nil)
        model.isCanvasExpanded = true
        #expect(model.canvasStarID == "t1")
        model.showProjectCanvas()
        #expect(model.canvasStarID == nil)
        #expect(model.projectPanel == .canvas)
        model.openStar("t1")
        #expect(model.canvasStarID == "t1")
        #expect(model.projectPanel == .canvas)
        model.togglePanel(.canvas)
        #expect(model.canvasStarID == nil)
        #expect(!model.isCanvasExpanded)
    }

    @Test func canvasFromTheProjectStartsWholeAndClearsFocusOnProjectSwitch() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        model.togglePanel(.canvas)
        #expect(model.canvasStarID == nil)
        model.update(snapshot("/rooms/other"))
        #expect(model.canvasStarID == nil)
        model.update(snapshot("/rooms/main"))
        #expect(model.projectPanel == .canvas)
        #expect(model.canvasStarID == nil)
    }

    @Test func eachProjectRemembersItsPanel() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        model.togglePanel(.todo)
        model.update(snapshot("/rooms/other"))
        #expect(model.projectPanel == nil)
        model.update(snapshot("/rooms/main"))
        #expect(model.projectPanel == .todo)
    }

    @Test func openingAnEarlierChatLeavesAStarDetail() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        let fields: [String: Any] = [
            "roomId": "main", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "stars": [["id": "t1", "sourceMessageId": "m1", "title": "Review",
                       "status": "working", "createdAt": "2026-11-14T10:00:00.000Z"]],
        ]
        model.updateStream(StreamSnapshot.decode(fields)!)
        model.openStar("t1")
        #expect(model.projectPanel == .star)
        model.update(snapshot("/rooms/design"))
        #expect(model.projectPanel == .todo)
        #expect(model.openStarID == nil)
    }

    @Test func toolbarConstellationsIconWhileAStarIsOpenReturnsToConstellations() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        model.updateStream(StreamSnapshot.decode([
            "roomId": "main", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "stars": [["id": "t1", "sourceMessageId": "m1", "title": "Review",
                       "status": "working", "createdAt": "2026-11-14T10:00:00.000Z"]],
        ])!)
        model.openStar("t1")
        #expect(model.projectPanel == .star)

        model.togglePanel(.todo)
        #expect(model.projectPanel == .todo)
        #expect(model.openStarID == nil)

        // Switching away and back keeps the list, not the old Star.
        model.update(snapshot("/rooms/other"))
        model.update(snapshot("/rooms/main"))
        #expect(model.projectPanel == .todo)
        #expect(model.openStarID == nil)
    }

    @Test func panelCloseButtonOnAStarClosesThePanel() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        model.updateStream(StreamSnapshot.decode([
            "roomId": "main", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "stars": [["id": "t1", "sourceMessageId": "m1", "title": "Review",
                       "status": "working", "createdAt": "2026-11-14T10:00:00.000Z"]],
        ])!)
        model.openStar("t1")
        // The header ✕ toggles whatever panel is open.
        model.togglePanel(.star)
        #expect(model.projectPanel == nil)
        #expect(model.openStarID == nil)
    }

    @Test func returningToAProjectRestoresItsStar() {
        let model = FrameModel()
        model.update(snapshot("/rooms/main"))
        model.updateStream(StreamSnapshot.decode([
            "roomId": "main", "projectId": "p1", "currentUserName": "Ada", "send": ["canSend": true],
            "stars": [["id": "t1", "sourceMessageId": "m1", "title": "Review",
                       "status": "working", "createdAt": "2026-11-14T10:00:00.000Z"]],
        ])!)
        model.openStar("t1")
        model.update(snapshot("/rooms/other"))
        model.update(snapshot("/rooms/main"))
        #expect(model.projectPanel == .star)
        #expect(model.openStarID == "t1")
    }

    @Test func aProjectNeverVisitedOpensItsFirstChat() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(snapshot(""))
        model.sidebarSelection = .project("p2")
        await settle()
        #expect(commander.navigatedPaths() == ["/ws/rooms/other"])
    }

    @Test func aProjectWithNoChatsLoadsItsAddressAsAFullPage() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(FrameSnapshot(workspaceID: ws, path: "/ws", projects: projects, tabs: [], hasTasteUpdates: false))
        model.sidebarSelection = .project("p2")
        await settle()
        #expect(commander.navigatedPaths().isEmpty)
        #expect(commander.loads == ["/ws/projects/p2"])
    }

    @Test func loadsThePageWhenNoPageAnswers() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        commander.navigateResult = .unavailable
        model.commander = commander
        model.update(snapshot(""))
        model.sidebarSelection = .taste
        await settle()
        #expect(commander.loads == ["/ws/inspiration?tab=taste"])
    }

    @Test func failuresBecomeAnAlert() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        commander.result = .failed("We could not delete the project.")
        model.commander = commander
        model.update(snapshot(""))
        await model.delete(projects[0])
        #expect(model.isShowingError)
        #expect(model.errorMessage == "We could not delete the project.")
        #expect(await model.createProject(name: "X", color: "red") == nil)
    }

    @Test func createProjectReturnsTheNewProjectID() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        commander.result = .ok(path: "/ws/projects/9F1C2D3E-0000-4000-8000-000000000001")
        model.commander = commander
        model.update(snapshot(""))
        #expect(await model.createProject(name: "Acme", color: "blue") == "9F1C2D3E-0000-4000-8000-000000000001")
    }

    @Test func sidebarHighlightStaysOnTheClickedPlaceUntilThePageArrives() async {
        let model = FrameModel()
        let commander = FakeFrameCommander()
        model.commander = commander
        model.update(snapshot(""))
        #expect(model.destination == .home)

        model.sidebarSelection = .taste
        #expect(model.destination == .taste)

        // An intermediate snapshot can still report the old route (activity poll,
        // mid-navigation). The highlight must not snap back.
        model.update(snapshot(""))
        #expect(model.destination == .taste)

        model.update(snapshot("/inspiration?tab=taste"))
        #expect(model.destination == .taste)
        #expect(model.pendingDestination == nil)
    }

    @Test func signingOutHidesTheSidebar() {
        let model = FrameModel()
        model.update(snapshot(""))
        model.pageDidLeaveFrame()
        #expect(!model.isAvailable)
        #expect(model.destination == nil)
    }

    @Test func toggleSidebarFlipsOnlyWhileSignedIn() {
        let model = FrameModel()
        #expect(model.isSidebarOpen)
        model.toggleSidebar()
        #expect(model.isSidebarOpen) // ignored while signed out
        model.update(snapshot(""))
        model.toggleSidebar()
        #expect(!model.isSidebarOpen)
        model.toggleSidebar()
        #expect(model.isSidebarOpen)
    }
}
