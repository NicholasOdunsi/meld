import ShelfCore
import Synchronization

public final class InMemoryTokenStore: TokenStore {
    private let stored: Mutex<String?>

    public init(token: String?) {
        stored = Mutex(token)
    }

    public func token() throws -> String? { stored.withLock { $0 } }
    public func save(_ token: String) throws { stored.withLock { $0 = token } }
    public func delete() throws { stored.withLock { $0 = nil } }
}
