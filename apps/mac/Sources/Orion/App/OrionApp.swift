import SwiftUI

@main
struct OrionApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        Settings {
            SettingsView()
                .environment(appDelegate.appModel)
        }
        .commands {
            // Own Show/Hide Sidebar (⌃⌘S) — SidebarCommands talks to the
            // system toggle, which does not work in our hosted window.
            FrameCommands(frame: appDelegate.frameModel, inspiration: appDelegate.inspirationModel)
        }
    }
}
