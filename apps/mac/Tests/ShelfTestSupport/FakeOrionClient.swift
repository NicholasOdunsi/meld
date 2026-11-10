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
}
