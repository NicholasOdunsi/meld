import Foundation
import Testing
@testable import ShelfCore

struct URLSessionOrionClientTests {
    let host = "orion-\(UUID().uuidString.lowercased()).test"
    var baseURL: URL { URL(string: "http://\(host)")! }

    private func client() -> URLSessionOrionClient {
        URLSessionOrionClient(baseURL: baseURL, session: StubURLProtocol.session())
    }

    @Test func connectPostsJSONAndDecodesTheToken() async throws {
        let workspaceID = UUID()
        StubURLProtocol.register(host: host) { request in
            #expect(request.url?.path() == "/api/shelf/connect")
            #expect(request.httpMethod == "POST")
            let body = try JSONDecoder().decode([String: String].self, from: StubURLProtocol.body(of: request))
            #expect(body == ["code": "ABCD1234", "deviceName": "Studio Mac"])
            let json = #"{"token":"orion_cap_x","workspaceId":"\#(workspaceID.uuidString.lowercased())","workspaceName":"Mine"}"#
            return (201, Data(json.utf8))
        }

        let response = try await client().connect(code: "ABCD1234", deviceName: "Studio Mac")

        #expect(response == ShelfConnectResponse(token: "orion_cap_x", workspaceId: workspaceID, workspaceName: "Mine"))
    }

    @Test func mapsTheServerErrorEnvelope() async {
        StubURLProtocol.register(host: host) { _ in
            (400, Data(#"{"error":{"code":"invalid_code","message":"That code didn't work."}}"#.utf8))
        }
        await #expect(throws: ShelfAPIError(code: .invalidCode, message: "That code didn't work.")) {
            try await client().connect(code: "X", deviceName: "Mac")
        }
    }

    @Test func roomsSendsTheBearerToken() async throws {
        let roomID = UUID()
        StubURLProtocol.register(host: host) { request in
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer orion_cap_t")
            let json = #"[{"roomId":"\#(roomID.uuidString.lowercased())","roomName":"Login","projectName":"App"}]"#
            return (200, Data(json.utf8))
        }
        #expect(try await client().rooms(token: "orion_cap_t") == [ShelfRoom(roomId: roomID, roomName: "Login", projectName: "App")])
    }

    @Test func uploadSendsMultipartWithLowercasedRoomID() async throws {
        let roomID = UUID()
        let itemID = UUID()
        StubURLProtocol.register(host: host) { request in
            #expect(request.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data; boundary=") == true)
            let body = String(decoding: StubURLProtocol.body(of: request), as: UTF8.self)
            #expect(body.contains("name=\"roomId\"\r\n\r\n\(roomID.uuidString.lowercased())\r\n"))
            #expect(body.contains("name=\"note\"\r\n\r\nnice\r\n"))
            #expect(body.contains("filename=\"image.jpg\""))
            return (201, Data(#"{"itemId":"\#(itemID.uuidString.lowercased())","duplicate":false,"roomLinked":true}"#.utf8))
        }
        let upload = ShelfUpload(data: Data([1]), mimeType: .jpeg, note: "nice", sourceURL: nil, roomID: roomID)

        let response = try await client().upload(upload, token: "orion_cap_t")

        #expect(response == ShelfUploadResponse(itemId: itemID, duplicate: false, roomLinked: true))
    }

    @Test(arguments: [
        (401, ShelfAPIError.Code.unauthorized),
        (413, .tooLarge),
        (415, .unsupportedType),
        (422, .invalidImage),
        (429, .rateLimited),
        (500, .unavailable),
    ])
    func fallsBackToTheStatusCodeWhenTheBodyIsNotJSON(status: Int, expected: ShelfAPIError.Code) async {
        StubURLProtocol.register(host: host) { _ in (status, Data("oops".utf8)) }
        do {
            _ = try await client().rooms(token: "orion_cap_t")
            Issue.record("expected an error")
        } catch {
            #expect(error.code == expected)
        }
    }

    @Test func unreachableServerIsANetworkError() async {
        let unreachable = URLSessionOrionClient(baseURL: URL(string: "http://nobody-registered.test")!, session: StubURLProtocol.session())
        await #expect(throws: ShelfAPIError.network) {
            try await unreachable.rooms(token: "t")
        }
    }
}
