import ShelfCore
import SwiftUI

struct TasteEditPanel: View {
    let tile: TasteTile
    @Bindable var model: TasteModel

    var body: some View {
        switch tile {
        case .density:
            DensityPanel(model: model)
        case .spacing:
            SpacingPanel(model: model)
        case .typography:
            TypographyPanel(model: model)
        case .colors:
            ColourPanel(model: model)
        case .designLanguage, .layoutHabits, .signatureDetails, .avoid:
            ListPanel(tile: tile, model: model)
        }
    }
}
