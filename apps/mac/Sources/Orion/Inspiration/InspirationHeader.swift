import OrionAppCore
import OrionDesignSystem
import SwiftUI

struct InspirationHeader: View {
    @Bindable var model: InspirationModel

    var body: some View {
        HStack(spacing: OrionSpacing.sm) {
            Text("Inspiration")
                .font(.title2.bold())
            Spacer(minLength: OrionSpacing.md)
            if !model.actionTargets.isEmpty {
                Button("Use in project") {
                    model.dialog = .useInProject(model.actionTargets)
                }
                .buttonStyle(OrionButtonStyle(.secondary))
                .disabled(!model.store.canEdit)
                Button("Delete") {
                    model.dialog = .delete(model.actionTargets)
                }
                .buttonStyle(OrionButtonStyle(.destructive))
                .disabled(!model.store.canEdit)
            }
            Slider(
                value: Binding(
                    get: { Double(model.tileStep.index) },
                    set: { model.tileStep = TileStep(index: Int($0.rounded())) }
                ),
                in: 0...4,
                step: 1
            ) {
                Text("Tile size")
            } minimumValueLabel: {
                Image(systemName: "photo")
            } maximumValueLabel: {
                Image(systemName: "photo.fill")
            }
            .controlSize(.small)
            .frame(width: 120)
            .help("Tile size (⌘+ / ⌘−)")
            .labelsHidden()
            .accessibilityLabel(String(localized: "Tile size"))
        }
    }
}
