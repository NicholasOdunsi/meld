import OrionDesignSystem
import ShelfCore
import SwiftUI

/// Shared back link, title, explanation, reason box, content, and Done / reset footer for one slot.
struct TastePanelChrome<Content: View>: View {
    let slot: TasteSlot
    @Bindable var model: TasteModel
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: OrionSpacing.md) {
                Button("‹ Back to board") { model.closePanel() }
                    .buttonStyle(OrionButtonStyle(.quiet))
                Text(slot.title).font(.title3.weight(.semibold))
                Text(slot.explanation).font(.callout).foregroundStyle(.secondary)
                content()
                if let reason, !reason.isEmpty {
                    VStack(alignment: .leading, spacing: OrionSpacing.xxs) {
                        Text("Why Orion chose this").font(.caption.weight(.semibold))
                        Text(reason).font(.caption).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(OrionSpacing.sm)
                    .background(.fill.tertiary, in: .rect(cornerRadius: OrionRadius.medium, style: .continuous))
                }
                if let primary = slot.primaryTile {
                    PlainWordsBox(tile: primary, model: model)
                }
                HStack(spacing: OrionSpacing.sm) {
                    Button("Done") { model.closePanel() }
                        .buttonStyle(OrionButtonStyle(.primary))
                    Button("Let Orion decide again") {
                        Task {
                            var ok = true
                            for tile in slot.tiles { ok = await model.store.resetTile(tile) && ok }
                            if ok { model.toast = String(localized: "Orion will look again after your next saves.") }
                        }
                    }
                    .buttonStyle(OrionButtonStyle(.secondary))
                    Spacer(minLength: 0)
                }
                .padding(.top, OrionSpacing.xs)
            }
            .padding(OrionSpacing.md)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var reason: String? {
        model.store.pending(in: slot).first { !$0.reason.isEmpty }?.reason
    }
}
