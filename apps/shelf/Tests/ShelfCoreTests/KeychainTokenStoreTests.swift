import Foundation
import Testing
@testable import ShelfCore

struct KeychainTokenStoreTests {
    @Test func savesReadsReplacesAndDeletes() throws {
        let store = KeychainTokenStore(service: "com.orion.shelf.tests.\(UUID().uuidString)", account: "http://127.0.0.1:3000")
        defer { try? store.delete() }

        #expect(try store.token() == nil)
        try store.save("orion_cap_one")
        #expect(try store.token() == "orion_cap_one")
        try store.save("orion_cap_two")
        #expect(try store.token() == "orion_cap_two")
        try store.delete()
        #expect(try store.token() == nil)
    }
}
