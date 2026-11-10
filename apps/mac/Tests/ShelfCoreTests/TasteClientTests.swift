import Foundation
import Testing
@testable import ShelfCore

struct TasteClientTests {
    let host = "orion-\(UUID().uuidString.lowercased()).test"
    var baseURL: URL { URL(string: "http://\(host)")! }
    private func client() -> URLSessionOrionClient { URLSessionOrionClient(baseURL: baseURL, session: StubURLProtocol.session()) }

    @Test func tasteGetsWithTheBearerToken() async throws {
        StubURLProtocol.register(host: host) { request in
            #expect(request.url?.path() == "/api/shelf/taste")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer t")
            return (200, Data(#"{"status":"learning"}"#.utf8))
        }
        #expect(try await client().taste(token: "t") == .learning)
    }

    @Test func saveTileSendsTileValueAndVersion() async throws {
        StubURLProtocol.register(host: host) { request in
            #expect(request.url?.path() == "/api/shelf/taste/tile")
            #expect(request.httpMethod == "PUT")
            let body = try JSONDecoder().decode([String: JSONValue].self, from: StubURLProtocol.body(of: request))
            #expect(body == ["tile": .string("density"), "value": .string("dense"), "expectedVersion": .number(3)])
            return (200, Data(#"{"version":4}"#.utf8))
        }
        #expect(try await client().saveTasteTile(.density, value: .string("dense"), expectedVersion: 3, token: "t") == TasteVersion(version: 4))
    }

    @Test func aConflictMapsToTheConflictCode() async {
        StubURLProtocol.register(host: host) { _ in (409, Data(#"{"status":"conflict"}"#.utf8)) }
        await #expect(throws: ShelfAPIError.self) {
            try await client().saveTasteTile(.density, value: .string("dense"), expectedVersion: 1, token: "t")
        }
        do { _ = try await client().saveTasteTile(.density, value: .string("dense"), expectedVersion: 1, token: "t") }
        catch { #expect(error.code == .conflict) }
    }

    @Test func decideAndAppleRulesUseTheirRoutes() async throws {
        StubURLProtocol.register(host: host) { request in
            if request.url?.path() == "/api/shelf/taste/apple-rules" { return (200, Data(#"{"enabled":false}"#.utf8)) }
            #expect(request.url?.path() == "/api/shelf/taste/suggestions/abc")
            let body = try JSONDecoder().decode([String: JSONValue].self, from: StubURLProtocol.body(of: request))
            #expect(body == ["decision": .string("kept"), "expectedVersion": .number(2)])
            return (200, Data(#"{"status":"kept"}"#.utf8))
        }
        #expect(try await client().decideTasteCard(id: "abc", decision: .kept, expectedVersion: 2, token: "t") == TasteDecisionResult(status: "kept"))
        #expect(try await client().setAppleRules(false, token: "t") == TasteAppleRules(enabled: false))
    }
}
