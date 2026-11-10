// TastePresentationTests.swift
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct TastePresentationTests {
    let board = TasteFixtures.board

    @Test func fourChaptersInOrderEveryRowExplained() {
        #expect(TasteChapters.all.map(\.title) == ["How it looks", "How it feels", "How it's put together", "What to steer clear of"])
        let tiles = TasteChapters.all.flatMap(\.rows).map(\.tile)
        #expect(Set(tiles) == Set(TasteTile.allCases))
        #expect(tiles.count == TasteTile.allCases.count)
        #expect(TasteChapters.all.flatMap(\.rows).allSatisfy { !$0.explanation.isEmpty })
    }

    @Test func summariesAreShortAndPlain() {
        #expect(TasteChapters.summary(of: .density, in: board) == "Airy")
        #expect(TasteChapters.summary(of: .spacing, in: board) == "Generous")
        #expect(TasteChapters.summary(of: .designLanguage, in: board) == "minimal")
        #expect(TasteChapters.summary(of: .layoutHabits, in: board) == "1 habit")
        #expect(TasteChapters.summary(of: .signatureDetails, in: board) == "None yet")
        #expect(TasteChapters.summary(of: .avoid, in: board) == "gradients")
    }

    @Test func densityPicturesMapOntoFiveStoredValues() {
        #expect(DensityChoice.choice(for: .light) == .airy)
        #expect(DensityChoice.choice(for: .compact) == .packed)
        #expect(DensityChoice.balanced.stored == .balanced)
        #expect(DensityChoice.packed.stored == .dense)
        #expect(DensityChoice.nudge(.airy, towardPacked: true) == .light)
        #expect(DensityChoice.nudge(.balanced, towardPacked: false) == .light)
        #expect(DensityChoice.nudge(.dense, towardPacked: true) == .dense)
        #expect(DensityChoice.nudge(.airy, towardPacked: false) == .airy)
    }

    @Test func sampleStyleFollowsTheBoard() throws {
        let airy = TasteSampleStyle(board: board)
        let dense = TasteSampleStyle(board: try #require(board.setting(.density, to: .string("dense"))))
        #expect(airy.rowGap > dense.rowGap)
        #expect(airy.padding > dense.padding)
        #expect(airy.accent == "#ff5a36")
        #expect(airy.background == "#ffffff")
        let heavy = TasteSampleStyle(board: try #require(board.setting(.typography, to: .object(["weight": .string("heavy"), "tracking": .string("tight"), "note": .string("")]))))
        #expect(heavy.titleWeight == .heavy)
        #expect(heavy.tracking < 0)
    }

    @Test func sampleFallsBackWhenColoursAreMissing() throws {
        let bare = try #require(board.setting(.colors, to: .array([.object(["hex": .string("#112233"), "role": .string("surface")])])))
        let style = TasteSampleStyle(board: bare)
        #expect(style.background == "#ffffff")   // no base colour → white
        #expect(style.accent == style.action)    // no accent → the action colour
    }
}
