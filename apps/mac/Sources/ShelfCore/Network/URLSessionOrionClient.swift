import Foundation

public struct URLSessionOrionClient: OrionClient {
    private let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func connect(code: String, deviceName: String) async throws(ShelfAPIError) -> ShelfConnectResponse {
        var request = URLRequest(url: baseURL.appending(path: "api/shelf/connect"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONEncoder().encode(ShelfConnectRequest(code: code, deviceName: deviceName))
        } catch {
            throw ShelfAPIError(code: .unavailable, message: String(localized: "Couldn't prepare the request."))
        }
        return try await send(request)
    }

    public func rooms(token: String) async throws(ShelfAPIError) -> [ShelfRoom] {
        var request = URLRequest(url: baseURL.appending(path: "api/shelf/rooms"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await send(request)
    }

    public func upload(_ upload: ShelfUpload, token: String) async throws(ShelfAPIError) -> ShelfUploadResponse {
        var form = MultipartFormBody()
        form.addFile(name: "file", fileName: "image.\(upload.mimeType.fileExtension)", mimeType: upload.mimeType.rawValue, data: upload.data)
        if let note = upload.note { form.addField(name: "note", value: note) }
        if let sourceURL = upload.sourceURL { form.addField(name: "sourceUrl", value: sourceURL.absoluteString) }
        // Lowercase to match the UUIDs Orion sends and validates.
        if let roomID = upload.roomID { form.addField(name: "roomId", value: roomID.uuidString.lowercased()) }

        var request = URLRequest(url: baseURL.appending(path: "api/shelf/items"))
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = form.finalized()
        return try await send(request)
    }

    public func library(offset: Int, token: String) async throws(ShelfAPIError) -> LibraryPage {
        var components = URLComponents(url: baseURL.appending(path: "api/shelf/library"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "offset", value: String(offset))]
        guard let url = components?.url else { throw .network }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await send(request, decoder: LibraryDates.decoder)
    }

    public func updateNote(itemID: UUID, note: String?, token: String) async throws(ShelfAPIError) -> LibraryItem {
        let path = "api/shelf/library/\(itemID.uuidString.lowercased())"
        return try await sendJSON(path: path, method: "PATCH", body: NoteBody(note: note), token: token)
    }

    public func deleteItems(_ ids: [UUID], token: String) async throws(ShelfAPIError) -> LibraryCount {
        try await sendJSON(path: "api/shelf/library/delete", method: "POST", body: IDsBody(ids: ids.map { $0.uuidString.lowercased() }), token: token)
    }

    public func addItems(_ ids: [UUID], toRoom roomID: UUID, token: String) async throws(ShelfAPIError) -> LibraryCount {
        let body = AddBody(ids: ids.map { $0.uuidString.lowercased() }, roomId: roomID.uuidString.lowercased())
        return try await sendJSON(path: "api/shelf/library/add-to-room", method: "POST", body: body, token: token)
    }

    public func taste(token: String) async throws(ShelfAPIError) -> TasteResponse {
        var request = URLRequest(url: baseURL.appending(path: "api/shelf/taste"))
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return try await send(request)
    }

    public func saveTasteTile(_ tile: TasteTile, value: JSONValue, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteVersion {
        try await sendJSON(path: "api/shelf/taste/tile", method: "PUT",
                           body: TileBody(tile: tile, value: value, expectedVersion: expectedVersion), token: token)
    }

    public func decideTasteCard(id: String, decision: TasteDecision, expectedVersion: Int, token: String) async throws(ShelfAPIError) -> TasteDecisionResult {
        try await sendJSON(path: "api/shelf/taste/suggestions/\(id.lowercased())", method: "POST",
                           body: DecisionBody(decision: decision.rawValue, expectedVersion: expectedVersion), token: token)
    }

    public func setAppleRules(_ enabled: Bool, token: String) async throws(ShelfAPIError) -> TasteAppleRules {
        try await sendJSON(path: "api/shelf/taste/apple-rules", method: "PUT", body: AppleBody(enabled: enabled), token: token)
    }

    public func resetTasteTile(_ tile: TasteTile, token: String) async throws(ShelfAPIError) -> TasteTileReset {
        try await sendJSON(path: "api/shelf/taste/reset-tile", method: "POST", body: ResetBody(tile: tile), token: token)
    }

    public func composeTaste(_ request: TasteComposeRequest, token: String) async throws(ShelfAPIError) -> TasteComposeResponse {
        var form = MultipartFormBody()
        if !request.words.isEmpty { form.addField(name: "words", value: request.words) }
        if !request.urls.isEmpty { form.addField(name: "urls", value: Self.json(request.urls.map(\.absoluteString))) }
        if !request.libraryItemIDs.isEmpty { form.addField(name: "libraryItemIds", value: Self.json(request.libraryItemIDs.map { $0.uuidString.lowercased() })) }
        if !request.replyTo.isEmpty { form.addField(name: "replyTo", value: Self.json(request.replyTo.map { $0.lowercased() })) }
        if let tile = request.tile { form.addField(name: "tile", value: tile.rawValue) }
        if let preset = request.preset { form.addField(name: "preset", value: preset.rawValue) }
        for file in request.files { form.addFile(name: "file", fileName: file.name, mimeType: file.mimeType, data: file.data) }
        var urlRequest = URLRequest(url: baseURL.appending(path: "api/shelf/taste/compose"))
        urlRequest.httpMethod = "POST"
        urlRequest.timeoutInterval = 90
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        urlRequest.httpBody = form.finalized()
        return try await send(urlRequest)
    }

    private static func json(_ values: [String]) -> String {
        (try? String(data: JSONEncoder().encode(values), encoding: .utf8)) ?? "[]"
    }

    private struct NoteBody: Encodable {
        let note: String?
        func encode(to encoder: any Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(note, forKey: .note) // writes null, not omitted
        }
        enum CodingKeys: String, CodingKey { case note }
    }
    private struct IDsBody: Encodable { let ids: [String] }
    private struct AddBody: Encodable { let ids: [String]; let roomId: String }
    private struct TileBody: Encodable { let tile: TasteTile; let value: JSONValue; let expectedVersion: Int }
    private struct DecisionBody: Encodable { let decision: String; let expectedVersion: Int }
    private struct AppleBody: Encodable { let enabled: Bool }
    private struct ResetBody: Encodable { let tile: TasteTile }

    private func sendJSON<Body: Encodable, Response: Decodable>(path: String, method: String, body: Body, token: String) async throws(ShelfAPIError) -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            request.httpBody = try JSONEncoder().encode(body)
        } catch {
            throw ShelfAPIError(code: .unavailable, message: String(localized: "Couldn't prepare the request."))
        }
        return try await send(request, decoder: LibraryDates.decoder)
    }

    private func send<Response: Decodable>(_ request: URLRequest, decoder: JSONDecoder = JSONDecoder()) async throws(ShelfAPIError) -> Response {
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw .network
        }
        guard let http = response as? HTTPURLResponse else { throw .network }
        guard (200..<300).contains(http.statusCode) else {
            throw Self.error(from: data, status: http.statusCode)
        }
        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw ShelfAPIError(code: .unavailable, message: String(localized: "Orion sent a response the shelf didn't understand."))
        }
    }

    private static func error(from data: Data, status: Int) -> ShelfAPIError {
        if let envelope = try? JSONDecoder().decode(ShelfErrorEnvelope.self, from: data),
           let code = ShelfAPIError.Code(rawValue: envelope.error.code) {
            return ShelfAPIError(code: code, message: envelope.error.message)
        }
        let code: ShelfAPIError.Code = switch status {
        case 401: .unauthorized
        case 404: .notFound
        case 409: .conflict
        case 413: .tooLarge
        case 415: .unsupportedType
        case 422: .invalidImage
        case 429: .rateLimited
        default: .unavailable
        }
        return ShelfAPIError(code: code, message: String(localized: "Orion couldn't save that right now. It will try again."))
    }
}
