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

    private func send<Response: Decodable>(_ request: URLRequest) async throws(ShelfAPIError) -> Response {
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
            return try JSONDecoder().decode(Response.self, from: data)
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
        case 413: .tooLarge
        case 415: .unsupportedType
        case 422: .invalidImage
        case 429: .rateLimited
        default: .unavailable
        }
        return ShelfAPIError(code: code, message: String(localized: "Orion couldn't save that right now. It will try again."))
    }
}
