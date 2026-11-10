import OrionDesignSystem
import ShelfCore
import SwiftUI

struct SpaceControls: View {
    @Bindable var model: TasteModel
    var body: some View {
        VStack(alignment: .leading, spacing: OrionSpacing.md) {
            Text("Density").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            DensityControls(model: model)
            Text("Spacing").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            SpacingControls(model: model)
            Text("Layout habits").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            ListEditor(tile: .layoutHabits, model: model)
        }
    }
}
