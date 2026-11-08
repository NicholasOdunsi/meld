protocol LaunchAtLogin {
    var isEnabled: Bool { get }
    func setEnabled(_ enabled: Bool) throws
}

enum LaunchAtLoginError: Error {
    case unavailable
}
