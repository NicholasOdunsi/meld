@testable import Orion

final class FakeLaunchAtLogin: LaunchAtLogin {
    private(set) var isEnabled = false
    var shouldFail = false

    func setEnabled(_ enabled: Bool) throws {
        if shouldFail { throw LaunchAtLoginError.unavailable }
        isEnabled = enabled
    }
}
