import Foundation
import Observation
import OrionAppCore
import SwiftUI

/// State for the native frame: the sidebar and the project's chat tabs.
/// The Orion page owns the data (it posts a snapshot over the bridge); this
/// model draws from it and turns clicks into page commands.
@MainActor
@Observable
final class FrameModel {
    private(set) var snapshot: FrameSnapshot?
    /// Set the moment a sidebar place is clicked, so the highlight moves
    /// before the page answers. Cleared by the next snapshot.
    private(set) var pendingDestination: FrameDestination?
    var errorMessage: String?
    var isCreatingProject = false
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
    @ObservationIgnored private var lastRoomByProject: [String: String] = [:]

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

    // MARK: Page → frame

    func update(_ snapshot: FrameSnapshot) {
        self.snapshot = snapshot
        pendingDestination = nil
        if let roomID = snapshot.currentRoomID, let tab = snapshot.tabs.first(where: { $0.id == roomID }) {
            lastRoomByProject[tab.projectID] = roomID
        }
    }

    /// Signed out (or on a page outside Orion's frame): hide the sidebar.
    func pageDidLeaveFrame() {
        snapshot = nil
        pendingDestination = nil
        lastRoomByProject = [:]
    }

    // MARK: Frame → page

    func open(_ destination: FrameDestination) {
        guard let snapshot, destination != self.destination else { return }
        pendingDestination = destination
        if case .project(let id) = destination,
           let roomID = lastRoomByProject[id].flatMap({ last in snapshot.tabs.contains { $0.id == last } ? last : nil })
            ?? snapshot.tabs(in: id).first?.id {
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

    func newTab() async {
        guard let project = currentProject else { return }
        await perform(
            "const f = window.__orionFrame; return f ? await f.createTab(projectId) : null;",
            arguments: ["projectId": project.id]
        )
    }

    /// Returns whether the project was created, so the sheet knows to close.
    func createProject(name: String, color: String) async -> Bool {
        await perform(
            "const f = window.__orionFrame; return f ? await f.createProject({ name, color }) : null;",
            arguments: ["name": name, "color": color]
        )
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
        guard let commander else { return false }
        switch await commander.callFrame(body, arguments: arguments) {
        case .ok(let path):
            if let path { navigate(to: path) }
            return true
        case .failed(let message):
            errorMessage = message
        case .unavailable:
            errorMessage = String(localized: "Orion isn't ready yet. Wait for the page to load, then try again.")
        }
        return false
    }
}
