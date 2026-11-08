import Security

public enum TokenStoreError: Error, Equatable, Sendable {
    case keychain(OSStatus)
}
