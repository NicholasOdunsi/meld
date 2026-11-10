import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct TasteBoardNewPartsTests {
    let board = TasteFixtures.board   // fixture JSON has none of the new fields

    @Test func anOldBoardDecodesWithDefaults() {
        #expect(board.motion == .snappy)
        #expect(board.shape == TasteShape(corners: .soft, depth: .shadows))
        #expect(board.voice == TasteVoice(tone: .plain, note: ""))
    }

    @Test func newPartsCanBeSet() throws {
        let motion = try #require(board.setting(.motion, to: .string("smooth")))
        #expect(motion.motion == .smooth)
        let shape = try #require(board.setting(.shape, to: .object(["corners": .string("round"), "depth": .string("hairlines")])))
        #expect(shape.shape == TasteShape(corners: .round, depth: .hairlines))
        let voice = try #require(board.setting(.voice, to: .object(["tone": .string("warm"), "note": .string("friendly")])))
        #expect(voice.voice == TasteVoice(tone: .warm, note: "friendly"))
    }

    @Test func valuesOutsideTheVocabularyAreRefused() {
        #expect(board.setting(.motion, to: .string("zippy")) == nil)
        #expect(board.setting(.shape, to: .object(["corners": .string("pointy"), "depth": .string("flat")])) == nil)
        #expect(board.setting(.voice, to: .object(["tone": .string("rude"), "note": .string("")])) == nil)
    }

    @Test func valueForReportsTheNewParts() {
        #expect(board.value(for: .motion) == .string("snappy"))
        #expect(board.value(for: .shape) == .object(["corners": .string("soft"), "depth": .string("shadows")]))
    }

    @Test func tilesNowNumberEleven() {
        #expect(TasteTile.allCases.count == 11)
    }
}
