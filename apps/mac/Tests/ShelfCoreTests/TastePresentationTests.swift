// TastePresentationTests.swift
import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct TastePresentationTests {
    let board = TasteFixtures.board

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
}
