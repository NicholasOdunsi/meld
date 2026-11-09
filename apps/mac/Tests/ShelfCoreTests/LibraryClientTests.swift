import Foundation
import Testing
@testable import ShelfCore

struct LibraryClientTests {
    let host = "orion-\(UUID().uuidString.lowercased()).test"
    var baseURL: URL { URL(string: "http://\(host)")! }
    let itemID = UUID()
    let roomID = UUID()

    private func client() -> URLSessionOrionClient {
        URLSessionOrionClient(baseURL: baseURL, session: StubURLProtocol.session())
    }

    private var itemJSON: String {
        #"{"id":"\#(itemID.uuidString.lowercased())","width":400,"height":800,"mimeType":"image/png","note":"nice","sourceUrl":"https://dribbble.com/x","createdAt":"2026-11-09T14:02:00.123Z","description":"Tall login.","labelState":"done","rooms":[{"roomId":"\#(roomID.uuidString.lowercased())","roomName":"Main","projectName":"Voxecore"}],"imageUrl":"https://signed/a"}"#
    }

    @Test func libraryGetsAPageWithTheBearerToken() async throws {
        StubURLProtocol.register(host: host) { request in
            #expect(request.url?.path() == "/api/shelf/library")
            #expect(request.url?.query() == "offset=100")
            #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer orion_cap_t")
            return (200, Data(#"{"items":[\#(itemJSON)],"nextOffset":200}"#.utf8))
        }
        let page = try await client().library(offset: 100, token: "orion_cap_t")
        #expect(page.nextOffset == 200)
        let item = try #require(page.items.first)
        #expect(item.id == itemID)
        #expect(item.aspectRatio == 0.5)
        #expect(item.labelState == .done)
        #expect(item.rooms == [ShelfRoom(roomId: roomID, roomName: "Main", projectName: "Voxecore")])
        #expect(item.sourceURL?.host() == "dribbble.com")
        #expect(abs(item.createdAt.timeIntervalSince1970 - 1_794_232_920.123) < 0.001)
    }

    @Test func updateNotePatchesJSON() async throws {
        StubURLProtocol.register(host: host) { request in
            #expect(request.httpMethod == "PATCH")
            #expect(request.url?.path() == "/api/shelf/library/\(itemID.uuidString.lowercased())")
            let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(of: request)) as? [String: Any]
            #expect(body?["note"] as? String == "fresh")
            return (200, Data(itemJSON.utf8))
        }
        _ = try await client().updateNote(itemID: itemID, note: "fresh", token: "t")
    }

    @Test func clearingANoteSendsNull() async throws {
        StubURLProtocol.register(host: host) { request in
            let text = String(decoding: StubURLProtocol.body(of: request), as: UTF8.self)
            #expect(text == #"{"note":null}"#)
            return (200, Data(itemJSON.utf8))
        }
        _ = try await client().updateNote(itemID: itemID, note: nil, token: "t")
    }

    @Test func deleteAndAddPostLowercasedIDs() async throws {
        StubURLProtocol.register(host: host) { request in
            let body = try JSONSerialization.jsonObject(with: StubURLProtocol.body(of: request)) as? [String: Any]
            #expect((body?["ids"] as? [String]) == [itemID.uuidString.lowercased()])
            if request.url?.path() == "/api/shelf/library/add-to-room" {
                #expect(body?["roomId"] as? String == roomID.uuidString.lowercased())
            }
            return (200, Data(#"{"count":1}"#.utf8))
        }
        #expect(try await client().deleteItems([itemID], token: "t") == LibraryCount(count: 1))
        #expect(try await client().addItems([itemID], toRoom: roomID, token: "t") == LibraryCount(count: 1))
    }

    @Test func notFoundMapsToItsCode() async {
        StubURLProtocol.register(host: host) { _ in
            (404, Data(#"{"error":{"code":"not_found","message":"That image is no longer in Inspiration."}}"#.utf8))
        }
        await #expect(throws: ShelfAPIError(code: .notFound, message: "That image is no longer in Inspiration.")) {
            try await client().updateNote(itemID: itemID, note: "x", token: "t")
        }
    }

    @Test func pageRoundTripsThroughTheCacheCoder() throws {
        let page = try LibraryDates.decoder.decode(LibraryPage.self, from: Data(#"{"items":[\#(itemJSON)],"nextOffset":null}"#.utf8))
        let again = try LibraryDates.decoder.decode(LibraryPage.self, from: LibraryDates.encoder.encode(page))
        #expect(again == page)
    }
}
