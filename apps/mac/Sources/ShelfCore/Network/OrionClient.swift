import Foundation

/// Everything the shelf asks of Orion. Behind a protocol so models and the
/// uploader are tested without a network.
public protocol OrionClient: Sendable {
    func connect(code: String, deviceName: String) async throws(ShelfAPIError) -> ShelfConnectResponse
    func rooms(token: String) async throws(ShelfAPIError) -> [ShelfRoom]
    func upload(_ upload: ShelfUpload, token: String) async throws(ShelfAPIError) -> ShelfUploadResponse
    func library(offset: Int, token: String) async throws(ShelfAPIError) -> LibraryPage
    func updateNote(itemID: UUID, note: String?, token: String) async throws(ShelfAPIError) -> LibraryItem
    func deleteItems(_ ids: [UUID], token: String) async throws(ShelfAPIError) -> LibraryCount
    func addItems(_ ids: [UUID], toRoom roomID: UUID, token: String) async throws(ShelfAPIError) -> LibraryCount
}
