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
    func taste(token: String) async throws(ShelfAPIError) -> TasteResponse
    func saveTasteTile(_ tile: TasteTile, value: JSONValue, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteVersion
    func decideTasteCard(id: String, decision: TasteDecision, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteDecisionResult
    func setAppleRules(_ enabled: Bool, token: String) async throws(ShelfAPIError) -> TasteAppleRules
    func resetTasteTile(_ tile: TasteTile, token: String) async throws(ShelfAPIError) -> TasteTileReset
    func composeTaste(_ request: TasteComposeRequest, token: String) async throws(ShelfAPIError) -> TasteComposeResponse
}
