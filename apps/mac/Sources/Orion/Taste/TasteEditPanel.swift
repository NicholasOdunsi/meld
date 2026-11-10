import ShelfCore
import SwiftUI

struct TasteEditPanel: View {
    let slot: TasteSlot
    @Bindable var model: TasteModel

    var body: some View {
        if slot == .craft {
            CraftRulesPanel(model: model)
        } else {
            TastePanelChrome(slot: slot, model: model) { controls }
        }
    }

    @ViewBuilder private var controls: some View {
        switch slot {
        case .motion: MotionControls(model: model)
        case .lettering: TypographyControls(model: model)
        case .shape: ShapeControls(model: model)
        case .space: SpaceControls(model: model)
        case .voice: VoiceControls(model: model)
        case .avoid: ListEditor(tile: .avoid, model: model)
        case .mood: ListEditor(tile: .designLanguage, model: model)
        case .craft: EmptyView()
        }
    }
}
