import Foundation
import ShelfCore

/// Plays back scripted results and records what it was sent.
public actor FakeOrionClient: OrionClient {
    private var uploadResults: [Result<ShelfUploadResponse, ShelfAPIError>]
    private let connectResult: Result<ShelfConnectResponse, ShelfAPIError>
    private let roomsResult: Result<[ShelfRoom], ShelfAPIError>
    public private(set) var uploads: [ShelfUpload] = []
    public private(set) var tokensSeen: [String] = []
    public private(set) var connectCodes: [String] = []

    public var libraryPages: [Result<LibraryPage, ShelfAPIError>] = []
    public var noteResult: Result<LibraryItem, ShelfAPIError>?
    public var deleteResult: Result<LibraryCount, ShelfAPIError> = .success(LibraryCount(count: 0))
    public var addResult: Result<LibraryCount, ShelfAPIError> = .success(LibraryCount(count: 0))
    public private(set) var libraryOffsets: [Int] = []
    public private(set) var notesSent: [(UUID, String?)] = []
    public private(set) var deletedIDs: [[UUID]] = []
    public private(set) var added: [([UUID], UUID)] = []

    public var tasteResults: [Result<TasteResponse, ShelfAPIError>] = []
    public var tileResult: Result<TasteVersion, ShelfAPIError> = .success(TasteVersion(version: 1))
    public var decideResult: Result<TasteDecisionResult, ShelfAPIError> = .success(TasteDecisionResult(status: "kept"))
    public var appleResult: Result<TasteAppleRules, ShelfAPIError> = .success(TasteAppleRules(enabled: true))
    public var resetResult: Result<TasteTileReset, ShelfAPIError>?
    public private(set) var tilesSaved: [(TasteTile, JSONValue, Int)] = []
    public private(set) var decisions: [(String, TasteDecision, Int)] = []
    public private(set) var appleSettings: [Bool] = []
    public private(set) var resets: [TasteTile] = []

    public init(
        uploadResults: [Result<ShelfUploadResponse, ShelfAPIError>] = [],
        connectResult: Result<ShelfConnectResponse, ShelfAPIError> = .success(
            ShelfConnectResponse(token: "orion_cap_test", workspaceId: UUID(), workspaceName: "Test")
        ),
        roomsResult: Result<[ShelfRoom], ShelfAPIError> = .success([])
    ) {
        self.uploadResults = uploadResults
        self.connectResult = connectResult
        self.roomsResult = roomsResult
    }

    public func setLibraryPages(_ pages: [Result<LibraryPage, ShelfAPIError>]) { libraryPages = pages }
    public func setNoteResult(_ result: Result<LibraryItem, ShelfAPIError>) { noteResult = result }
    public func setDeleteResult(_ result: Result<LibraryCount, ShelfAPIError>) { deleteResult = result }
    public func setAddResult(_ result: Result<LibraryCount, ShelfAPIError>) { addResult = result }
    public func setTasteResults(_ r: [Result<TasteResponse, ShelfAPIError>]) { tasteResults = r }
    public func setTileResult(_ r: Result<TasteVersion, ShelfAPIError>) { tileResult = r }
    public func setDecideResult(_ r: Result<TasteDecisionResult, ShelfAPIError>) { decideResult = r }
    public func setAppleResult(_ r: Result<TasteAppleRules, ShelfAPIError>) { appleResult = r }

    public func connect(code: String, deviceName: String) async throws(ShelfAPIError) -> ShelfConnectResponse {
        connectCodes.append(code)
        return try connectResult.get()
    }

    public func rooms(token: String) async throws(ShelfAPIError) -> [ShelfRoom] {
        try roomsResult.get()
    }

    public func upload(_ upload: ShelfUpload, token: String) async throws(ShelfAPIError) -> ShelfUploadResponse {
        uploads.append(upload)
        tokensSeen.append(token)
        guard !uploadResults.isEmpty else { throw ShelfAPIError.network }
        return try uploadResults.removeFirst().get()
    }

    public func library(offset: Int, token: String) async throws(ShelfAPIError) -> LibraryPage {
        libraryOffsets.append(offset)
        guard !libraryPages.isEmpty else { throw ShelfAPIError.network }
        return try libraryPages.removeFirst().get()
    }

    public func updateNote(itemID: UUID, note: String?, token: String) async throws(ShelfAPIError) -> LibraryItem {
        notesSent.append((itemID, note))
        guard let noteResult else { throw ShelfAPIError.network }
        return try noteResult.get()
    }

    public func deleteItems(_ ids: [UUID], token: String) async throws(ShelfAPIError) -> LibraryCount {
        deletedIDs.append(ids)
        return try deleteResult.get()
    }

    public func addItems(_ ids: [UUID], toRoom roomID: UUID, token: String) async throws(ShelfAPIError) -> LibraryCount {
        added.append((ids, roomID))
        return try addResult.get()
    }

    public func taste(token: String) async throws(ShelfAPIError) -> TasteResponse {
        guard !tasteResults.isEmpty else { throw ShelfAPIError.network }
        return try tasteResults.removeFirst().get()
    }

    public func saveTasteTile(_ tile: TasteTile, value: JSONValue, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteVersion {
        tilesSaved.append((tile, value, expectedVersion))
        return try tileResult.get()
    }

    public func decideTasteCard(id: String, decision: TasteDecision, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteDecisionResult {
        decisions.append((id, decision, expectedVersion))
        return try decideResult.get()
    }

    public func setAppleRules(_ enabled: Bool, token: String) async throws(ShelfAPIError) -> TasteAppleRules {
        appleSettings.append(enabled)
        return try appleResult.get()
    }

    public func resetTasteTile(_ tile: TasteTile, token: String) async throws(ShelfAPIError) -> TasteTileReset {
        resets.append(tile)
        return try (resetResult ?? .success(TasteTileReset(tile: tile))).get()
    }
}
