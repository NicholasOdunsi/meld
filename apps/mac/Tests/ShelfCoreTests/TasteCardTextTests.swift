import Testing
@testable import ShelfCore

struct TasteCardTextTests {
    @Test func headlinesAreReadable() {
        #expect(TasteCardText.headline(TasteCard(id: "1", tile: .density, op: "set", value: .string("dense"), reason: "", evidenceItemIds: [])) == "Density · set to Dense")
        #expect(TasteCardText.headline(TasteCard(id: "2", tile: .layoutHabits, op: "add", value: .string("Sidebar plus one column"), reason: "", evidenceItemIds: [])) == "Layout habits · add “Sidebar plus one column”")
        #expect(TasteCardText.headline(TasteCard(id: "3", tile: .avoid, op: "add", value: .object(["text": .string("gradients"), "source": .string("typed")]), reason: "", evidenceItemIds: [])) == "You avoid · add “gradients”")
        #expect(TasteCardText.headline(TasteCard(id: "4", tile: .colors, op: "add", value: .object(["hex": .string("#ff5a36"), "role": .string("accent")]), reason: "", evidenceItemIds: [])) == "Colour · add accent #ff5a36")
    }

    @Test func typographyAndFallback() {
        #expect(TasteCardText.headline(TasteCard(id: "5", tile: .typography, op: "set", value: .object(["weight": .string("bold"), "tracking": .string("tight"), "note": .string("")]), reason: "", evidenceItemIds: [])) == "Typography · set to Bold, tight tracking")
        #expect(TasteCardText.headline(TasteCard(id: "6", tile: .spacing, op: "nudge", value: .string("tight"), reason: "", evidenceItemIds: [])) == "Spacing · changed")
    }
}
