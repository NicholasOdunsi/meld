/// Where the capture token lives. Only `KeychainTokenStore` is used in the app.
public protocol TokenStore: Sendable {
    func token() throws -> String?
    func save(_ token: String) throws
    func delete() throws
}
