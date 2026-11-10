import Foundation
import ShelfTestSupport
import Testing
@testable import ShelfCore

struct TasteSlotsTests {
    @Test func everyTileExceptColoursHasExactlyOneSlot() {
        for tile in TasteTile.allCases where tile != .colors {
            let owners = TasteSlot.allCases.filter { $0.tiles.contains(tile) }
            #expect(owners.count == 1, "\(tile) should belong to exactly one slot")
            #expect(TasteSlot.slot(for: tile) == owners.first)
        }
        #expect(TasteSlot.slot(for: .colors) == nil)
    }

    @Test func theBoardHasSevenSlotsInOrder() {
        #expect(TasteSlot.boardSlots == [.motion, .lettering, .shape, .space, .voice, .avoid, .craft])
    }

    @Test func mappingMatchesTheSpec() {
        #expect(TasteSlot.slot(for: .typography) == .lettering)
        #expect(TasteSlot.slot(for: .signatureDetails) == .shape)
        #expect(TasteSlot.slot(for: .density) == .space)
        #expect(TasteSlot.slot(for: .spacing) == .space)
        #expect(TasteSlot.slot(for: .layoutHabits) == .space)
        #expect(TasteSlot.slot(for: .designLanguage) == .mood)
        #expect(TasteSlot.craft.tiles.isEmpty)
        #expect(TasteSlot.craft.primaryTile == nil)
    }

    @Test func everySlotHasATitleAndExplanation() {
        for slot in TasteSlot.allCases {
            #expect(!slot.title.isEmpty)
            #expect(!slot.explanation.isEmpty)
        }
    }

    @Test func tilesHavePlainDisplayNames() {
        #expect(TasteTile.density.displayName == "Density")
        #expect(TasteTile.motion.displayName == "Motion")
        #expect(TasteTile.avoid.displayName == "You avoid")
    }
}
