import Foundation

/// Pages where Orion's frame (sidebar + tabs) doesn't apply: signing in and
/// first-time setup. Landing on one hides the native sidebar.
public enum FramePages {
    public static func isOutsideFrame(_ url: URL?) -> Bool {
        guard let path = url?.path() else { return false }
        return ["/sign-in", "/auth", "/onboarding", "/invitations"].contains { path == $0 || path.hasPrefix($0 + "/") }
    }
}
