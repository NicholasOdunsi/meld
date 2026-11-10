import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct TasteDocumentTests {
    let board = TasteFixtures.board   // snappy, regular/normal type, soft/shadows, airy/generous, plain voice

    @Test func theHeadlineSumsUpTheTasteInFiveWords() throws {
        #expect(TasteDocument.headline(board) == "Quick, clear and plain-spoken.")
        let bold = try #require(board.setting(.typography, to: .object(["weight": .string("bold"), "tracking": .string("normal"), "note": .string("")])))
        let calm = try #require(bold.setting(.motion, to: .string("smooth")))
        #expect(TasteDocument.headline(calm) == "Calm, bold and plain-spoken.")
    }

    @Test func sixSectionsInOrder() {
        #expect(TasteDocument.sections(for: board).map(\.slot) == [.motion, .lettering, .shape, .space, .voice, .avoid])
    }

    @Test func sentencesAreBuiltFromTheBoardWithChoiceWords() {
        let sections = TasteDocument.sections(for: board)
        #expect(sections[0].segments == [.text("Everything moves "), .choice(.motion, "snappy"), .text(": quick, with no bounce, about a tenth of a second.")])
        #expect(sections[1].segments == [.text("Headings are "), .choice(.weight, "regular"), .text(" with "), .choice(.tracking, "normal"), .text(" spacing between the letters. Numbers always line up.")])
        #expect(sections[2].segments == [.text("Corners are "), .choice(.corners, "soft"), .text(". Depth comes from "), .choice(.depth, "shadows"), .text(", not lines.")])
        #expect(sections[3].segments == [.text("Screens feel "), .choice(.density, "airy"), .text(", with "), .choice(.spacing, "generous"), .text(" gaps between things.")])
        #expect(sections[4].segments == [.text("Words are "), .choice(.tone, "plain"), .text(". Errors always stay calm.")])
    }

    @Test func aPreviewedChangeShowsTheOldWordStruckAndTheNewOne() throws {
        let dense = try #require(board.setting(.density, to: .string("dense")))
        let space = TasteDocument.sections(for: board, previewing: dense)[3]
        #expect(space.segments == [.text("Screens feel "), .changed(.density, old: "airy", new: "dense"), .text(", with "), .choice(.spacing, "generous"), .text(" gaps between things.")])
        let snappy = TasteDocument.sections(for: board, previewing: dense)[0]
        #expect(snappy.segments.allSatisfy { if case .changed = $0 { false } else { true } })
    }

    @Test func notesListWhatYouOftenUse() throws {
        let sections = TasteDocument.sections(for: board)
        #expect(sections[3].noteItems == ["Single column forms"])
        #expect(sections[2].noteItems.isEmpty)
        let withDetails = try #require(board.setting(.signatureDetails, to: .array([.string("Pill buttons"), .string("Soft shadows")])))
        #expect(TasteDocument.sections(for: withDetails)[2].noteItems == ["Pill buttons", "Soft shadows"])
    }

    @Test func theAvoidSectionShowsItemsAsPillsNotASentence() throws {
        let sections = TasteDocument.sections(for: board)
        #expect(sections[5].segments.isEmpty)
        #expect(sections[5].noteItems == ["gradients"])
        let none = try #require(board.setting(.avoid, to: .array([])))
        #expect(TasteDocument.sections(for: none)[5].noteItems.isEmpty)
        let many = try #require(board.setting(.avoid, to: .array(["a", "b", "c", "d", "e", "f"].map { .object(["text": .string($0), "source": .string("typed")]) })))
        #expect(TasteDocument.sections(for: many)[5].noteItems == ["a", "b", "c", "d", "e", "f"])
    }

    @Test func everyChoiceOffersPlainOptionsAndAppliesThem() throws {
        #expect(TasteChoiceID.motion.options.map(\.value) == ["instant", "snappy", "smooth", "playful"])
        #expect(TasteChoiceID.density.options.map(\.value) == ["airy", "light", "balanced", "compact", "dense"])
        for choice in TasteChoiceID.allCases {
            #expect(!choice.options.isEmpty)
            #expect(choice.options.allSatisfy { !$0.title.isEmpty && !$0.meaning.isEmpty })
            #expect(choice.options.contains { $0.value == choice.value(in: board) })
        }
        #expect(try #require(TasteChoiceID.motion.applying("smooth", to: board)).motion == .smooth)
        let heavy = try #require(TasteChoiceID.weight.applying("heavy", to: board))
        #expect(heavy.typography.weight == .heavy && heavy.typography.tracking == .normal)
        let round = try #require(TasteChoiceID.corners.applying("round", to: board))
        #expect(round.shape == TasteShape(corners: .round, depth: .shadows))
        let warm = try #require(TasteChoiceID.tone.applying("warm", to: board))
        #expect(warm.voice == TasteVoice(tone: .warm, note: ""))
        #expect(TasteChoiceID.motion.applying("zippy", to: board) == nil)
    }

    @Test func eachChoiceBelongsToOneStoredTile() {
        #expect(TasteChoiceID.motion.tile == .motion)
        #expect(TasteChoiceID.weight.tile == .typography && TasteChoiceID.tracking.tile == .typography)
        #expect(TasteChoiceID.corners.tile == .shape && TasteChoiceID.depth.tile == .shape)
        #expect(TasteChoiceID.density.tile == .density && TasteChoiceID.spacing.tile == .spacing)
        #expect(TasteChoiceID.tone.tile == .voice)
        for choice in TasteChoiceID.allCases { #expect(TasteSlot.slot(for: choice.tile) == choice.slot) }
    }
}
