import SwiftUI

/// File ▸ New Project (⌘N), New Chat Tab (⌘T), View ▸ Hide/Show Sidebar (⌃⌘S),
/// and Inspiration tile size (⌘+ / ⌘−).
struct FrameCommands: Commands {
    let frame: FrameModel
    let inspiration: InspirationModel

    var body: some Commands {
        CommandGroup(replacing: .newItem) {
            Button("New Project") { frame.isCreatingProject = true }
                .keyboardShortcut("n")
                .disabled(!frame.isAvailable)
            Button("New Chat Tab") { Task { await frame.newTab() } }
                .keyboardShortcut("t")
                .disabled(frame.currentProject == nil)
        }
        CommandGroup(replacing: .sidebar) {
            Button(frame.isSidebarOpen ? "Hide Sidebar" : "Show Sidebar") {
                frame.toggleSidebar()
            }
            .keyboardShortcut("s", modifiers: [.control, .command])
            .disabled(!frame.isAvailable)
        }
        CommandGroup(after: .sidebar) {
            Button("Bigger Tiles") { inspiration.biggerTiles() }
                .keyboardShortcut("+", modifiers: [.command])
                .disabled(frame.destination != .inspiration)
            Button("Smaller Tiles") { inspiration.smallerTiles() }
                .keyboardShortcut("-", modifiers: [.command])
                .disabled(frame.destination != .inspiration)
        }
    }
}
