import AppKit
import SwiftUI

/// Finder-style glass: the desktop and windows behind Orion show through,
/// blurred. Uses the system's own material so it turns solid when "Reduce
/// transparency" is on and dims when the window is in the background.
struct WindowGlass: NSViewRepresentable {
    var material: NSVisualEffectView.Material = .underWindowBackground

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = .behindWindow
        view.state = .followsWindowActiveState
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
    }
}

/// Sidebar column glass — same see-through material Finder uses for sidebars.
typealias SidebarMaterial = WindowGlass

extension WindowGlass {
    static var sidebar: WindowGlass { WindowGlass(material: .sidebar) }
    /// Same family as the sidebar so the whole window reads as one glass surface.
    static var content: WindowGlass { WindowGlass(material: .sidebar) }
}
