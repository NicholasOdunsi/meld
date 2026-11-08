import Testing
@testable import OrionAppCore

struct LaunchContextTests {
    @Test func opensTheWindowWhenYouOpenOrion() {
        #expect(LaunchContext.shouldShowWindowAtLaunch(launchedAsLoginItem: false))
    }

    @Test func staysInTheMenuBarAtLogin() {
        #expect(LaunchContext.shouldShowWindowAtLaunch(launchedAsLoginItem: true) == false)
    }
}
