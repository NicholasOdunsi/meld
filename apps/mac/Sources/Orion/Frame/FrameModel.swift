import Foundation
import Observation
import OrionAppCore
import SwiftUI
import UniformTypeIdentifiers

/// State for the native frame: the sidebar and project screen.
/// The Orion page owns the data (it posts a snapshot over the bridge); this
/// model draws from it and turns clicks into page commands.
@MainActor
@Observable
final class FrameModel {
    private(set) var snapshot: FrameSnapshot?
    private(set) var stream: StreamSnapshot?
    var projectPanel: ProjectPanel?
    var isCanvasExpanded = false
    private(set) var canvasStarID: String?
    private(set) var canvasScreenID: String?
    /// The width the person dragged the To-do / Constellations / Star / Artifacts panel to.
    /// One value for all of them; saved across launches. Use
    /// `detailSplit(detailWidth:)` to draw, which keeps it in range. Saved
    /// only when a drag ends (`finishSidePanelDrag`).
    private(set) var preferredSidePanelWidth: Double =
        PanelWidth.resolveStored(UserDefaults.standard.object(forKey: FrameModel.sidePanelWidthKey)) {
        didSet { UserDefaults.standard.set(preferredSidePanelWidth, forKey: Self.sidePanelWidthKey) }
    }
    /// The width being dragged to right now; drawn instead of the saved one
    /// until the drag ends.
    private(set) var liveSidePanelWidth: Double?
    @ObservationIgnored private var sidePanelDrag = PanelResizeDrag()
    private static let sidePanelWidthKey = "orion.sidePanelWidth"

    /// A move of the panel-edge drag (see `PanelResizeDrag`).
    func changeSidePanelDrag(startLocationX: Double, translation: Double, detailWidth: Double) {
        let shown = DetailSplit(detailWidth: detailWidth,
                                panel: .side(preferredWidth: preferredSidePanelWidth)).panelWidth
        if let width = sidePanelDrag.change(startLocationX: startLocationX, translation: translation,
                                            shownWidth: shown, detailWidth: detailWidth) {
            liveSidePanelWidth = width
        }
    }

    /// The drag ended or was cancelled: save the dragged width (a click saves nothing).
    func finishSidePanelDrag() {
        if let width = sidePanelDrag.end() { preferredSidePanelWidth = width }
        liveSidePanelWidth = nil
    }

    var isDraggingSidePanel: Bool { liveSidePanelWidth != nil }
    var openStarID: String?
    private var sidebarWasOpenBeforeCanvas: Bool?
    @ObservationIgnored private var panelByProject: [String: ProjectPanel] = [:]
    @ObservationIgnored private var starByProject: [String: String] = [:]
    var modelByProject: [String: String] = [:]
    var selectedModelByProject: [String: String] = [:]
    /// Set the moment a sidebar place is clicked, so the highlight moves
    /// before the page answers. Cleared only when a snapshot confirms that place —
    /// clearing on every snapshot made the highlight flash back to the old row.
    private(set) var pendingDestination: FrameDestination?
    var errorMessage: String?
    var isCreatingProject = false
    /// Project the Edit Project dialog (logo + name) is open for.
    var editingProject: FrameProject?
    /// Bumped when a company logo changes, so every project mark redraws.
    var logoRevision = 0
    /// Project the Delete dialog is open for.
    var deletingProject: FrameProject?

    /// Whether one of Orion's dialogs is over the window.
    var isShowingDialog: Bool {
        isCreatingProject || editingProject != nil || deletingProject != nil
    }
    /// Whether the person wants the sidebar open (the toggle by the traffic
    /// lights, View ▸ Hide Sidebar, ⌃⌘S).
    var isSidebarOpen = true

    /// Hide or show the sidebar. Used by the toolbar button and ⌃⌘S.
    func toggleSidebar() {
        guard isAvailable else { return }
        isSidebarOpen.toggle()
    }

    @ObservationIgnored weak var commander: (any FrameCommanding)?
    /// Which chat each project was last showing, so switching projects
    /// returns to it instead of always reopening Main.
    @ObservationIgnored private var didReportTimeZone = false
    @ObservationIgnored private var timeZoneObserver: (any NSObjectProtocol)?

    init() {
        timeZoneObserver = NotificationCenter.default.addObserver(
            forName: .NSSystemTimeZoneDidChange, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor in await self?.reportTimeZone() }
        }
    }

    /// How a project's detail column `detailWidth` wide is shared between the
    /// chat and the open panel. The project screen, the panel divider and the
    /// panel title in the header all use this, so they agree to the point.
    func detailSplit(detailWidth: Double) -> DetailSplit {
        let panel: DetailSplit.Panel? = switch projectPanel {
        case .todo, .star, .artifacts: .side(preferredWidth: liveSidePanelWidth ?? preferredSidePanelWidth)
        case .canvas: isCanvasExpanded ? .canvasExpanded : .canvas
        case nil: nil
        }
        return DetailSplit(detailWidth: detailWidth, panel: panel)
    }

    var isAvailable: Bool { snapshot != nil }
    var destination: FrameDestination? { pendingDestination ?? snapshot?.destination }

    /// The sidebar's selection. Writing it opens that place.
    var sidebarSelection: FrameDestination? {
        get { destination }
        set { if let newValue { open(newValue) } }
    }

    var currentProject: FrameProject? {
        guard case .project(let id) = destination else { return nil }
        return snapshot?.projects.first { $0.id == id }
    }

    var currentTabs: [FrameTab] {
        guard let snapshot, let project = currentProject else { return [] }
        return snapshot.tabs(in: project.id)
    }

    /// The tab bar's selection. Writing it opens that chat.
    var tabSelection: String? {
        get { snapshot?.currentRoomID }
        set { if let newValue { openTab(newValue) } }
    }

    var isShowingError: Bool {
        get { errorMessage != nil }
        set { if !newValue { errorMessage = nil } }
    }

    func chatCount(for project: FrameProject) -> Int {
        snapshot?.tabs.count { $0.projectID == project.id } ?? 0
    }

    var visibleStream: StreamSnapshot? {
        guard let stream, let snapshot, stream.roomID == snapshot.currentRoomID,
              stream.projectID == currentProject?.id else { return nil }
        return stream
    }

    func updateStream(_ value: StreamSnapshot) { stream = value }

    /// Opens `panel`, or closes it when it's already open. A Star lives inside
    /// Constellations, so the Constellations icon while a Star is open goes
    /// back to the list rather than closing the panel.
    func togglePanel(_ panel: ProjectPanel) {
        let next: ProjectPanel? = projectPanel == panel ? nil : panel
        let enteringCanvasFromStar = next == .canvas && projectPanel == .star ? openStarID : nil
        if projectPanel == .canvas, next != .canvas {
            if let sidebarWasOpenBeforeCanvas { isSidebarOpen = sidebarWasOpenBeforeCanvas }
            sidebarWasOpenBeforeCanvas = nil
        } else if projectPanel != .canvas, next == .canvas {
            sidebarWasOpenBeforeCanvas = isSidebarOpen
            isSidebarOpen = false
        }
        projectPanel = next
        canvasStarID = next == .canvas ? enteringCanvasFromStar : nil
        canvasScreenID = nil
        if next != .canvas { isCanvasExpanded = false }
        if next != .star { openStarID = nil }
        if let projectID = currentProject?.id {
            panelByProject[projectID] = next
            if next != .star { starByProject[projectID] = nil }
        }
        guard let snapshot else { return }
        let tab = switch projectPanel {
        case .canvas: "user-flows"
        case .artifacts: "conversation"
        default: "conversation"
        }
        if let room = snapshot.currentRoomID { navigate(to: "/\(snapshot.workspaceID)/rooms/\(room)?tab=\(tab)") }
    }

    func openStar(_ id: String) {
        guard visibleStream?.stars.contains(where: { $0.id == id }) == true else { return }
        if projectPanel == .canvas {
            canvasStarID = id
            canvasScreenID = nil
            return
        }
        if projectPanel == .canvas, let sidebarWasOpenBeforeCanvas {
            isSidebarOpen = sidebarWasOpenBeforeCanvas
            self.sidebarWasOpenBeforeCanvas = nil
        }
        openStarID = id
        projectPanel = .star
        isCanvasExpanded = false
        if let projectID = currentProject?.id {
            panelByProject[projectID] = .star
            starByProject[projectID] = id
        }
    }

    func showProjectCanvas() {
        guard projectPanel == .canvas else { return }
        canvasStarID = nil
        canvasScreenID = nil
    }

    func openScreenInCanvas(_ id: String) {
        if projectPanel != .canvas { togglePanel(.canvas) }
        canvasStarID = nil
        canvasScreenID = id
    }

    @discardableResult
    func retryDesignProposal(_ messageID: String) async -> Bool {
        guard let stream = visibleStream else { return false }
        return await perform(
            "const f = window.__orionStream; return f ? await f.retryDesignProposal({roomId, messageId}) : null;",
            arguments: ["roomId": stream.roomID, "messageId": messageID]
        )
    }

    @discardableResult
    func renameStar(_ id: String, to title: String) async -> Bool {
        guard let stream = visibleStream else { return false }
        return await perform(
            "const f = window.__orionStream; return f ? await f.renameStar({roomId, taskId, title}) : null;",
            arguments: ["roomId": stream.roomID, "taskId": id, "title": title]
        )
    }

    @discardableResult
    func setStarConstellation(_ id: String, title: String, name: String?) async -> Bool {
        guard let stream = visibleStream else { return false }
        return await perform(
            "const f = window.__orionStream; return f ? await f.setStarConstellation({roomId, taskId, title, name}) : null;",
            arguments: ["roomId": stream.roomID, "taskId": id, "title": title, "name": name ?? NSNull()]
        )
    }

    @discardableResult
    func renameConstellation(_ currentName: String, to nextName: String) async -> Bool {
        guard let stream = visibleStream else { return false }
        return await perform(
            "const f = window.__orionStream; return f ? await f.renameConstellation({roomId, currentName, nextName}) : null;",
            arguments: ["roomId": stream.roomID, "currentName": currentName, "nextName": nextName]
        )
    }

    func stageStreamAttachment(_ url: URL) async -> String? {
        guard let stream = visibleStream, let commander else { return nil }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? Data(contentsOf: url), data.count <= 10_000_000 else {
            errorMessage = "That file is too large or could not be read."
            return nil
        }
        let mimeType = (try? url.resourceValues(forKeys: [.contentTypeKey]).contentType)?.preferredMIMEType
            ?? "application/octet-stream"
        let result = await commander.callFrame(
            "const f = window.__orionStream; return f ? await f.stage({roomId, name, mimeType, base64}) : null;",
            arguments: ["roomId": stream.roomID, "name": url.lastPathComponent,
                        "mimeType": mimeType, "base64": data.base64EncodedString()]
        )
        switch result {
        case .ok(let path): return path?.split(separator: "/").last.map(String.init)
        case .failed(let message): errorMessage = message
        case .unavailable: errorMessage = "Orion isn't ready yet. Try again."
        }
        return nil
    }

    func discardStreamAttachment(_ id: String) async {
        guard let stream = visibleStream, let commander else { return }
        _ = await commander.callFrame(
            "const f = window.__orionStream; return f ? await f.discard({roomId, attachmentId}) : null;",
            arguments: ["roomId": stream.roomID, "attachmentId": id]
        )
    }

    /// The provider and model the composer would send with for the current
    /// project: the user's pick, else the device's default.
    var selectedStreamModel: (provider: String?, model: String?) {
        guard let stream = visibleStream else { return (nil, nil) }
        let selected = modelByProject[stream.projectID] ?? stream.defaultProvider
        let choice = stream.choices.first(where: { $0.provider == selected }) ?? stream.choices.first
        return (choice?.provider, selectedModelByProject[stream.projectID] ?? choice?.defaultModel)
    }

    func sendStream(_ body: String, provider: String?, model: String?, attachmentIDs: [String] = [],
                    starTaskID: String? = nil) async -> Bool {
        guard let stream = visibleStream else { return false }
        let result = await call(
            "const f = window.__orionStream; return f ? await f.post({roomId, body, providerOverride, modelOverride, attachmentIds, starTaskId, starTitle}) : null;",
            arguments: ["roomId": stream.roomID, "body": body,
                        "providerOverride": provider ?? NSNull(), "modelOverride": model ?? NSNull(),
                        "attachmentIds": attachmentIDs, "starTaskId": starTaskID ?? NSNull(),
                        "starTitle": stream.stars.first(where: { $0.id == starTaskID })?.title ?? NSNull()]
        )
        return result.succeeded
    }

    // MARK: Page → frame

    func update(_ snapshot: FrameSnapshot) {
        let oldProjectID: String? = if case .project(let id) = self.snapshot?.destination { id } else { nil }
        let newProjectID: String? = if case .project(let id) = snapshot.destination { id } else { nil }
        if oldProjectID != newProjectID {
            if projectPanel == .canvas, let sidebarWasOpenBeforeCanvas {
                isSidebarOpen = sidebarWasOpenBeforeCanvas
                self.sidebarWasOpenBeforeCanvas = nil
            }
            projectPanel = newProjectID.flatMap { panelByProject[$0] }
            canvasStarID = nil
            canvasScreenID = nil
            openStarID = newProjectID.flatMap { starByProject[$0] }
            if projectPanel == .canvas {
                sidebarWasOpenBeforeCanvas = isSidebarOpen
                isSidebarOpen = false
            }
        } else if self.snapshot?.currentRoomID != snapshot.currentRoomID {
            canvasStarID = nil
            canvasScreenID = nil
            if projectPanel == .star {
                projectPanel = .todo
                openStarID = nil
                if let newProjectID {
                    panelByProject[newProjectID] = .todo
                    starByProject[newProjectID] = nil
                }
            }
        }
        self.snapshot = snapshot
        if pendingDestination == snapshot.destination {
            pendingDestination = nil
        }
        if !didReportTimeZone {
            didReportTimeZone = true
            Task { await reportTimeZone() }
        }
    }

    /// Signed out (or on a page outside Orion's frame): hide the sidebar.
    func pageDidLeaveFrame() {
        snapshot = nil
        pendingDestination = nil
        stream = nil
        projectPanel = nil
        openStarID = nil
        canvasStarID = nil
        canvasScreenID = nil
        sidebarWasOpenBeforeCanvas = nil
        panelByProject.removeAll()
        starByProject.removeAll()
    }

    // MARK: Frame → page

    func open(_ destination: FrameDestination) {
        guard let snapshot, destination != self.destination else { return }
        pendingDestination = destination
        if case .project(let id) = destination,
           let roomID = snapshot.tabs(in: id).first?.id {
            // Straight to the chat it was last on, else its first (Main).
            navigate(to: "/\(snapshot.workspaceID)/rooms/\(roomID)")
        } else {
            navigate(to: destination.path(workspaceID: snapshot.workspaceID))
        }
    }

    func openTab(_ roomID: String) {
        guard let snapshot, roomID != snapshot.currentRoomID else { return }
        navigate(to: "/\(snapshot.workspaceID)/rooms/\(roomID)")
    }

    /// Returns the new project's id, or nil if it wasn't created — the sheet
    /// closes on success and files the optional company logo under that id.
    func createProject(name: String, color: String) async -> String? {
        let outcome = await call(
            "const f = window.__orionFrame; return f ? await f.createProject({ name, color }) : null;",
            arguments: ["name": name, "color": color]
        )
        guard outcome.succeeded else { return nil }
        // The page answers with the project's address: /<workspace>/projects/<id>.
        let parts = FrameDestination.pathComponents(outcome.path ?? "")
        guard parts.count > 2, parts[1] == "projects" else { return "" }
        return parts[2]
    }

    func rename(_ project: FrameProject, to name: String) async {
        await perform(
            "const f = window.__orionFrame; return f ? await f.renameProject(projectId, name) : null;",
            arguments: ["projectId": project.id, "name": name]
        )
    }

    func delete(_ project: FrameProject) async {
        await perform(
            "const f = window.__orionFrame; return f ? await f.deleteProject(projectId) : null;",
            arguments: ["projectId": project.id]
        )
    }

    func openArtifactPath(_ path: String) { navigate(to: path) }

    // MARK: Private

    private func navigate(to path: String) {
        // A project address is a server redirect to its first chat (creating
        // Main if needed). WKWebView can leave a client-side navigation to a
        // redirect blank, so load those as a full page.
        if FrameDestination.pathComponents(path).dropFirst().first == "projects" {
            commander?.load(path: path)
            return
        }
        Task {
            let result = await commander?.callFrame(
                "const f = window.__orionFrame; return f ? f.navigate(path) : null;",
                arguments: ["path": path]
            )
            // No page to ask (it's mid-load or failed): load the address itself.
            if result == nil || result == .unavailable { commander?.load(path: path) }
        }
    }

    @discardableResult
    private func perform(_ body: String, arguments: [String: any Sendable]) async -> Bool {
        await call(body, arguments: arguments).succeeded
    }

    private func call(_ body: String, arguments: [String: any Sendable]) async -> (succeeded: Bool, path: String?) {
        guard let commander else { return (false, nil) }
        switch await commander.callFrame(body, arguments: arguments) {
        case .ok(let path):
            if let path { navigate(to: path) }
            return (true, path)
        case .failed(let message):
            errorMessage = message
        case .unavailable:
            errorMessage = String(localized: "Orion isn't ready yet. Wait for the page to load, then try again.")
        }
        return (false, nil)
    }
}

extension FrameModel: TodoSyncing {
    func saveTodo(_ item: FrameTodo) async -> Bool {
        let arguments: [String: any Sendable] = [
            "id": item.id, "text": item.text, "position": item.position,
            "projectId": item.projectID ?? NSNull(),
        ]
        return await perform(
            "const f = window.__orionFrame; return f ? await f.saveTodo({ id, text, projectId, position }) : null;",
            arguments: arguments
        )
    }

    func moveTodos(_ ids: [String], to stage: FrameTodoStage) async -> Bool {
        await perform(
            "const f = window.__orionFrame; return f ? await f.moveTodos(ids, stage) : null;",
            arguments: ["ids": ids, "stage": stage.rawValue]
        )
    }

    func deleteTodos(_ ids: [String]) async -> Bool {
        await perform(
            "const f = window.__orionFrame; return f ? await f.deleteTodos(ids) : null;",
            arguments: ["ids": ids]
        )
    }

    /// Tell the page which time zone the owner is in, for the 6 am to-dos.
    func reportTimeZone() async {
        guard let commander else { return }
        _ = await commander.callFrame(
            "const f = window.__orionFrame; return f && f.setTimeZone ? await f.setTimeZone(zone) : null;",
            arguments: ["zone": TimeZone.current.identifier]
        )
    }
}
