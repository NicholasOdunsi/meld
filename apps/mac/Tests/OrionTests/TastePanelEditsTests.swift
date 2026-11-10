import ShelfCore
import Testing
@testable import Orion

struct TastePanelEditsTests {
    let colors = [TasteColor(hex: "#ffffff", role: .base), TasteColor(hex: "#111111", role: .action), TasteColor(hex: "#ff5a36", role: .accent)]

    @Test func settingAnExistingRoleReplacesIt() {
        let value = TasteEdits.palette(setting: .accent, to: "#00aa66", in: colors)
        #expect(value == .array([
            .object(["hex": .string("#ffffff"), "role": .string("base")]),
            .object(["hex": .string("#111111"), "role": .string("action")]),
            .object(["hex": .string("#00aa66"), "role": .string("accent")]),
        ]))
    }

    @Test func settingAMissingRoleAppends() {
        let value = TasteEdits.palette(setting: .surface, to: "#eeeeee", in: colors)
        guard case .array(let items) = value else { Issue.record("array"); return }
        #expect(items.count == 4)
    }

    @Test func addingRejectsEmptyDuplicateLongAndOverLimit() {
        #expect(TasteEdits.adding("  ", to: [], limit: 5, maxLength: 80) == nil)
        #expect(TasteEdits.adding("Pill buttons", to: ["pill BUTTONS"], limit: 5, maxLength: 80) == nil)
        #expect(TasteEdits.adding(String(repeating: "a", count: 81), to: [], limit: 5, maxLength: 80) == nil)
        #expect(TasteEdits.adding("x", to: ["a", "b"], limit: 2, maxLength: 80) == nil)
        #expect(TasteEdits.adding("  Pill buttons ", to: ["a"], limit: 5, maxLength: 80) == ["a", "Pill buttons"])
    }

    @Test func removingDropsTheMatch() {
        #expect(TasteEdits.removing("b", from: ["a", "b", "c"]) == ["a", "c"])
    }

    @Test func typographyKeepsTheNote() {
        let value = TasteEdits.typography(TasteTypography(weight: .regular, tracking: .normal, note: "Quiet"), weight: .bold, tracking: nil)
        #expect(value == .object(["weight": .string("bold"), "tracking": .string("normal"), "note": .string("Quiet")]))
    }
}
