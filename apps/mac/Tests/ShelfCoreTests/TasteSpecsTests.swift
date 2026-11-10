import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct TasteSpecsTests {
    @Test func motionTimingsMatchTheSpec() {
        let instant = TasteMotionSpec(.instant)
        #expect(instant.enterDuration == 0 && instant.rise == 0 && instant.blur == 0 && instant.overshoot == 0)
        let snappy = TasteMotionSpec(.snappy)
        #expect(snappy.enterDuration == 0.15 && snappy.rise == 12 && snappy.blur == 4 && snappy.overshoot == 0)
        #expect(snappy.curve == [0.2, 0, 0, 1])
        #expect(TasteMotionSpec(.smooth).enterDuration == 0.30)
        let playful = TasteMotionSpec(.playful)
        #expect(playful.enterDuration == 0.45)
        #expect(playful.overshoot == 0.03)
    }

    @Test func fixedMotionValuesAreTheSameForEveryPersonality() {
        #expect(TasteMotionSpec.pressScale == 0.96)
        #expect(TasteMotionSpec.pressDuration == 0.15)
        #expect(TasteMotionSpec.exitDuration == 0.15)
        #expect(TasteMotionSpec.exitRise == 12)
        #expect(TasteMotionSpec.exitBlur == 4)
        #expect(TasteMotionSpec.staggerInterval == 0.1)
        #expect(TasteMotionSpec.loopSeconds == 2.4)
    }

    @Test func everyPersonalityHasATitleAndMeaning() {
        for motion in TasteMotion.allCases {
            let spec = TasteMotionSpec(motion)
            #expect(spec.motion == motion)
            #expect(!spec.title.isEmpty && !spec.meaning.isEmpty)
        }
        #expect(TasteMotionSpec(.snappy).title == "Snappy")
    }

    @Test func eightCraftRulesInFourGroups() {
        #expect(TasteCraftRules.all.count == 8)
        #expect(Set(TasteCraftRules.all.map(\.id)).count == 8)
        #expect(TasteCraftRules.all.allSatisfy { !$0.title.isEmpty && !$0.reason.isEmpty })
        #expect(TasteCraftRules.rules(in: .motion).count == 4)
        #expect(TasteCraftRules.rules(in: .typeAndSurfaces).count == 2)
        #expect(TasteCraftRules.rules(in: .touch).count == 1)
        #expect(TasteCraftRules.rules(in: .words).count == 1)
        #expect(TasteCraftRules.all.first?.title == "Pressing a button scales it to 0.96")
    }

    @Test func voiceLinesDifferByToneAndErrorsStayPlain() {
        let lines = Set(TasteVoiceTone.allCases.map { TasteVoiceExamples.successLine(for: $0) })
        #expect(lines.count == 4)
        #expect(TasteVoiceExamples.emptyLine(for: .plain) == "Nothing here yet.")
        #expect(TasteVoiceExamples.errorsStayPlain == "Errors stay calm and plain.")
        #expect(TasteVoiceTone.warm.title == "Warm")
    }

    @Test func sampleStyleFollowsDensityTypeShapeAndMotion() throws {
        let board = TasteFixtures.board
        let airy = TasteSampleStyle(board: board)
        let dense = TasteSampleStyle(board: try #require(board.setting(.density, to: .string("dense"))))
        #expect(airy.rowGap > dense.rowGap)
        #expect(airy.padding > dense.padding)
        let heavy = TasteSampleStyle(board: try #require(board.setting(.typography, to: .object(["weight": .string("heavy"), "tracking": .string("tight"), "note": .string("")]))))
        #expect(heavy.titleWeight == .heavy)
        #expect(heavy.tracking < 0)
        let round = TasteSampleStyle(board: try #require(board.setting(.shape, to: .object(["corners": .string("round"), "depth": .string("flat")]))))
        let sharp = TasteSampleStyle(board: try #require(board.setting(.shape, to: .object(["corners": .string("sharp"), "depth": .string("flat")]))))
        #expect(round.cornerRadius > sharp.cornerRadius)
        #expect(round.depth == .flat)
        #expect(TasteSampleStyle(board: board).motion == .snappy)
    }
}
