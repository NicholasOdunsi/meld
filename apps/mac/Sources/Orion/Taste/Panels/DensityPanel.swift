import OrionDesignSystem
import ShelfCore
import SwiftUI

struct DensityPanel: View {
    @Bindable var model: TasteModel

    private var board: TasteBoard? { model.store.board }
    private var selected: DensityChoice {
        DensityChoice.choice(for: board?.density ?? .balanced)
    }

    var body: some View {
        TastePanelChrome(tile: .density, model: model) {
            VStack(alignment: .leading, spacing: OrionSpacing.sm) {
                HStack(alignment: .top, spacing: OrionSpacing.xs) {
                    ForEach(DensityChoice.allCases, id: \.self) { choice in
                        PictureChoice(title: choice.title, isSelected: selected == choice) {
                            Task { await model.store.save(.density, to: .string(choice.stored.rawValue)) }
                        } picture: {
                            MiniScreen(.density(choice))
                        }
                    }
                }
                HStack(spacing: OrionSpacing.sm) {
                    Button("A bit more room") {
                        guard let density = board?.density else { return }
                        let next = DensityChoice.nudge(density, towardPacked: false)
                        Task { await model.store.save(.density, to: .string(next.rawValue)) }
                    }
                    .buttonStyle(OrionButtonStyle(.quiet))
                    Button("A bit tighter") {
                        guard let density = board?.density else { return }
                        let next = DensityChoice.nudge(density, towardPacked: true)
                        Task { await model.store.save(.density, to: .string(next.rawValue)) }
                    }
                    .buttonStyle(OrionButtonStyle(.quiet))
                }

                Text("Quick starts")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TasteDashedChips(items: ["Make it feel like Apple"]) { _ in
                    Task { await model.composeAppleQuickStart() }
                }
                .disabled(!model.store.canEdit)
            }
        }
    }
}
