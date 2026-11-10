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

    @Test func newTilesReadInPlainWords() {
        #expect(TasteCardText.headline(TasteCard(id: "6", tile: .motion, op: "set", value: .string("smooth"), reason: "", evidenceItemIds: [])) == "Motion · set to Smooth")
        #expect(TasteCardText.headline(TasteCard(id: "7", tile: .shape, op: "set", value: .object(["corners": .string("round"), "depth": .string("hairlines")]), reason: "", evidenceItemIds: [])) == "Shape · set to Round, Hairlines")
        #expect(TasteCardText.headline(TasteCard(id: "8", tile: .voice, op: "set", value: .object(["tone": .string("warm"), "note": .string("")]), reason: "", evidenceItemIds: [])) == "Voice · set to Warm")
    }
}
