import Testing
@testable import OrionAppCore

struct NotificationGateTests {
    @Test func staysQuietWhileYouAreLookingAtOrion() {
        #expect(NotificationGate.shouldPresent(appIsActive: true, windowIsKey: true) == false)
    }

    @Test(arguments: [(false, false), (false, true), (true, false)])
    func notifiesWhenYouAreElsewhere(_ active: Bool, _ key: Bool) {
        #expect(NotificationGate.shouldPresent(appIsActive: active, windowIsKey: key))
    }
}
