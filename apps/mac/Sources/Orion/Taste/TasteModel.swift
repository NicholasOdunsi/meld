import Observation
import ShelfCore

/// What is open on top of the Taste page: a choice menu, a list editor, or the craft rules.
enum TastePopover: Hashable {
    case choice(TasteChoiceID)
    case list(TasteTile)
    case craft

    var slot: TasteSlot? {
        switch self {
        case .choice(let choice): choice.slot
        case .list(let tile): TasteSlot.slot(for: tile)
        case .craft: .craft
        }
    }
}

@MainActor
@Observable
final class TasteModel {
    let store: TasteStore
    var popover: TastePopover?
    var isPreviewing = false
    /// The option the pointer is over in a choice menu: the specimens show it, nothing is saved.
    var hoveredOption: (choice: TasteChoiceID, value: String)?
    var toast: String?

    init(store: TasteStore) {
        self.store = store
    }

    /// The board with the hovered menu option applied, for the specimens. Never saved.
    var displayBoard: TasteBoard? {
        guard let board = store.board else { return nil }
        guard let hovered = hoveredOption, let previewed = hovered.choice.applying(hovered.value, to: board) else { return board }
        return previewed
    }

    func open(_ popover: TastePopover) {
        guard store.canEdit || popover == .craft else { return }
        self.popover = popover
    }

    func closePopover() {
        popover = nil
        hoveredOption = nil
    }
}
