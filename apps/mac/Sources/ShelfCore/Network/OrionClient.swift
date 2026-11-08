/// Everything the shelf asks of Orion. Behind a protocol so models and the
/// uploader are tested without a network.
public protocol OrionClient: Sendable {
    func connect(code: String, deviceName: String) async throws(ShelfAPIError) -> ShelfConnectResponse
    func rooms(token: String) async throws(ShelfAPIError) -> [ShelfRoom]
    func upload(_ upload: ShelfUpload, token: String) async throws(ShelfAPIError) -> ShelfUploadResponse
}
