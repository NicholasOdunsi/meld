/// A notification is only useful when you aren't already looking at Orion.
public enum NotificationGate {
    public static func shouldPresent(appIsActive: Bool, windowIsKey: Bool) -> Bool {
        !(appIsActive && windowIsKey)
    }
}
