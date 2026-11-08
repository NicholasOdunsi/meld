import Foundation
import UserNotifications

/// Shows Mac notifications; clicking one opens its page in the Orion window.
/// If permission is denied, nothing is shown.
@MainActor
final class NotificationPresenter: NSObject, NotificationPresenting, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()
    private let open: (URL) -> Void
    private var askedForPermission = false

    init(open: @escaping (URL) -> Void) {
        self.open = open
        super.init()
        center.delegate = self
    }

    func present(title: String, body: String, url: URL) async {
        if !askedForPermission {
            askedForPermission = true
            _ = try? await center.requestAuthorization(options: [.alert, .sound])
        }
        let settings = await center.notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = ["url": url.absoluteString]
        try? await center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
    }

    /// The bridge already decided this should show, so show it even while Orion is frontmost.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let text = response.notification.request.content.userInfo["url"] as? String, let url = URL(string: text) else { return }
        await MainActor.run { open(url) }
    }
}
