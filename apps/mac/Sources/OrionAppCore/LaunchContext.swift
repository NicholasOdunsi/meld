/// When Orion starts at login it should sit quietly in the menu bar; when you open it, show the window.
public enum LaunchContext {
    public static func shouldShowWindowAtLaunch(launchedAsLoginItem: Bool) -> Bool {
        !launchedAsLoginItem
    }
}
