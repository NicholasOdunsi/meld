import Foundation
import Testing
@testable import ShelfCore

struct LimitsTests {
    /// Fails if someone changes INSPIRATION_LIMITS in the TypeScript contract without updating Limits.swift.
    @Test func matchesTheTypeScriptContract() throws {
        let contract = URL(filePath: #filePath)
            .deletingLastPathComponent()
            .appending(path: "../../../../packages/contracts/src/inspiration.ts")
            .standardizedFileURL
        let source = try String(contentsOf: contract, encoding: .utf8)
        #expect(source.contains("maxBytes: 10_485_760"))
        #expect(source.contains("maxEdge: 4096"))
        #expect(source.contains("fallbackEdge: 2048"))
        #expect(source.contains("noteMax: 500"))
        #expect(source.contains("sourceUrlMax: 2048"))
        #expect(Limits.maxBytes == 10_485_760)
        #expect(Limits.maxEdge == 4096)
        #expect(Limits.fallbackEdge == 2048)
        #expect(Limits.noteMax == 500)
        #expect(Limits.sourceURLMax == 2048)
    }
}
