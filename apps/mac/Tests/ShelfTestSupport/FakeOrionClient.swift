import Foundation
import ShelfCore

/// Plays back scripted results and records what it was sent.
public actor FakeOrionClient: OrionClient {
    private var uploadResults: [Result<ShelfUploadResponse, ShelfAPIError>]
    private let connectResult: Result<ShelfConnectResponse, ShelfAPIError>
    private let roomsResult: Result<[ShelfRoom], ShelfAPIError>
    public private(set) var uploads: [ShelfUpload] = []
    public private(set) var tokensSeen: [String] = []

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

    public func connect(code: String, deviceName: String) async throws(ShelfAPIError) -> ShelfConnectResponse {
        try connectResult.get()
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
}
